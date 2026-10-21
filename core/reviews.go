package main

import (
	"crypto/hmac"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// reviewCooldownSec is the minimum delay between reviews from one source.
const reviewCooldownSec = 60

// createReviewRequest is the public (site) review payload.
type createReviewRequest struct {
	Rating   int    `json:"rating"`
	Text     string `json:"text"`
	Identity string `json:"identity"`
	Author   string `json:"author"`
}

// updateReviewRequest edits an existing review via its secret token.
type updateReviewRequest struct {
	Rating    *int   `json:"rating"`
	Text      *string `json:"text"`
	EditToken string `json:"edit_token"`
}

// adminReviewRequest is the trusted (bot / manual) review payload.
type adminReviewRequest struct {
	Rating     int    `json:"rating"`
	Text       string `json:"text"`
	Identity   string `json:"identity"`
	Author     string `json:"author"`
	Source     string `json:"source"`
	TGID       int64  `json:"tg_id"`
	TGUsername string `json:"tg_username"`
	AvatarB64  string `json:"avatar_b64"`
	AvatarExt  string `json:"avatar_ext"`
}

type reviewListResponse struct {
	Reviews    []publicView `json:"reviews"`
	Aggregate  Aggregate    `json:"aggregate"`
	MyReview   *publicView  `json:"my_review,omitempty"`
	CooldownS  int          `json:"cooldown_s"`
}

type mineResponse struct {
	Found     bool        `json:"found"`
	Review    *publicView `json:"review,omitempty"`
	CooldownS int         `json:"cooldown_s"`
}

// clientIP extracts the caller IP forwarded by the worker, falling back to
// the socket address for direct local calls.
func clientIP(r *http.Request) string {
	if v := r.Header.Get("X-Real-IP"); v != "" {
		if host, _, err := net.SplitHostPort(v); err == nil {
			return host
		}
		return v
	}
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		if part := strings.TrimSpace(strings.Split(v, ",")[0]); part != "" {
			if host, _, err := net.SplitHostPort(part); err == nil {
				return host
			}
			return part
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// checkBlocked returns a matching block for the caller's IP or device id.
func (s *apiServer) checkBlocked(r *http.Request) *Block {
	s.store.mu.Lock()
	defer s.store.mu.Unlock()
	if b := s.store.blockBy("ip", clientIP(r)); b != nil {
		return b
	}
	if dev := r.Header.Get("X-Device-Id"); dev != "" {
		if b := s.store.blockBy("device", dev); b != nil {
			return b
		}
	}
	return nil
}

func writeBlocked(w http.ResponseWriter, b *Block) {
	writeJSON(w, http.StatusForbidden, map[string]string{"error": "blocked", "reason": b.Reason})
}

// cooldownLeft returns remaining seconds before another review is allowed
// for the given key (ip or tg id).
func (s *apiServer) cooldownLeft(key string) int {
	if reviewCooldownSec <= 0 {
		return 0
	}
	s.reviewMu.Lock()
	defer s.reviewMu.Unlock()
	last, ok := s.reviewCooldown[key]
	if !ok {
		return 0
	}
	if left := reviewCooldownSec - int(time.Since(last).Seconds()); left > 0 {
		return left
	}
	return 0
}

func (s *apiServer) touchCooldown(key string) {
	if reviewCooldownSec <= 0 {
		return
	}
	s.reviewMu.Lock()
	defer s.reviewMu.Unlock()
	s.reviewCooldown[key] = time.Now()
	if len(s.reviewCooldown) > 5000 {
		cutoff := time.Now().Add(-time.Duration(reviewCooldownSec*4) * time.Second)
		for k, t := range s.reviewCooldown {
			if t.Before(cutoff) {
				delete(s.reviewCooldown, k)
			}
		}
	}
}

// GET /api/reviews — public list + aggregate.
func (s *apiServer) handleListReviews(w http.ResponseWriter, r *http.Request) {
	if b := s.checkBlocked(r); b != nil {
		writeBlocked(w, b)
		return
	}
	s.store.mu.Lock()
	reviews := s.store.sortedReviews()
	views := make([]publicView, 0, len(reviews))
	for _, rev := range reviews {
		views = append(views, rev.public())
	}
	agg := s.store.aggregate()
	s.store.mu.Unlock()
	writeJSON(w, http.StatusOK, reviewListResponse{Reviews: views, Aggregate: agg, CooldownS: reviewCooldownSec})
}

// GET /api/reviews/mine?identity=... — fetch the caller's own review.
func (s *apiServer) handleMyReview(w http.ResponseWriter, r *http.Request) {
	if b := s.checkBlocked(r); b != nil {
		writeBlocked(w, b)
		return
	}
	identity := r.URL.Query().Get("identity")
	resp := mineResponse{CooldownS: reviewCooldownSec}
	if identity != "" {
		s.store.mu.Lock()
		if rev := s.store.findByIdentity(identity); rev != nil {
			v := rev.public()
			resp.Found = true
			resp.Review = &v
		}
		s.store.mu.Unlock()
	}
	writeJSON(w, http.StatusOK, resp)
}

// POST /api/reviews — create or update-by-identity (site guests).
func (s *apiServer) handleCreateReview(w http.ResponseWriter, r *http.Request) {
	if b := s.checkBlocked(r); b != nil {
		writeBlocked(w, b)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var req createReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Rating = clampRating(req.Rating)
	req.Text = strings.TrimSpace(req.Text)
	req.Identity = strings.TrimSpace(req.Identity)
	req.Author = strings.TrimSpace(req.Author)
	if req.Identity == "" || len(req.Identity) > 128 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "identity required"})
		return
	}
	if req.Text == "" || len(req.Text) > 2000 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "comment required"})
		return
	}
	if req.Author == "" || len(req.Author) > 64 {
		req.Author = "Guest"
	}

	ip := clientIP(r)
	if left := s.cooldownLeft("ip:" + ip); left > 0 {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "cooldown", "retry": itoa(left)})
		return
	}

	rev := &Review{
		Rating:    req.Rating,
		Text:      req.Text,
		Author:    req.Author,
		Source:    SourceSite,
		Identity:  req.Identity,
		IP:        ip,
		UserAgent: r.Header.Get("User-Agent"),
	}

	s.store.mu.Lock()
	if existing := s.store.findByIdentity(req.Identity); existing != nil {
		rev.EditToken = existing.EditToken
	}
	err := s.store.upsertReview(rev)
	if stored := s.store.findByIdentity(req.Identity); stored != nil {
		rev = stored
	}
	s.store.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save failed"})
		return
	}
	s.touchCooldown("ip:" + ip)
	s.store.touchActivity(req.Identity)

	writeJSON(w, http.StatusOK, map[string]any{"id": rev.ID, "edit_token": rev.EditToken})
}

// PUT /api/reviews/{id} — edit own review via secret token.
func (s *apiServer) handleUpdateReview(w http.ResponseWriter, r *http.Request) {
	if b := s.checkBlocked(r); b != nil {
		writeBlocked(w, b)
		return
	}
	id := r.PathValue("id")
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var req updateReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	s.store.mu.Lock()
	rev := s.store.find(id)
	if rev == nil || req.EditToken == "" || rev.EditToken != req.EditToken {
		s.store.mu.Unlock()
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	if req.Rating != nil {
		rev.Rating = clampRating(*req.Rating)
	}
	if req.Text != nil {
		text := strings.TrimSpace(*req.Text)
		if len(text) > 2000 {
			s.store.mu.Unlock()
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "comment too long"})
			return
		}
		rev.Text = text
	}
	rev.UpdatedAt = time.Now().UTC()
	rev.Notified = false
	err := s.store.saveReviews()
	s.store.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// DELETE /api/reviews/{id} — author removes own review via secret token (X-Edit-Token header).
func (s *apiServer) handleDeleteReview(w http.ResponseWriter, r *http.Request) {
	if b := s.checkBlocked(r); b != nil {
		writeBlocked(w, b)
		return
	}
	id := r.PathValue("id")
	token := strings.TrimSpace(r.Header.Get("X-Edit-Token"))
	s.store.mu.Lock()
	rev := s.store.find(id)
	if rev == nil {
		s.store.mu.Unlock()
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if token == "" || rev.EditToken != token {
		s.store.mu.Unlock()
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	err := s.store.deleteReview(id)
	s.store.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /api/reviews/avatar/{id} — serve a stored avatar image.
func (s *apiServer) handleReviewAvatar(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.store.mu.Lock()
	var path string
	if rev := s.store.find(id); rev != nil {
		path = rev.AvatarPath
	}
	s.store.mu.Unlock()
	if path == "" {
		http.NotFound(w, r)
		return
	}
	f, err := os.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil || fi.IsDir() {
		http.NotFound(w, r)
		return
	}
	ctype := "image/jpeg"
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png":
		ctype = "image/png"
	case ".webp":
		ctype = "image/webp"
	}
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(w, r, filepath.Base(path), fi.ModTime(), f)
}

// requireAdmin enforces the admin token on trusted endpoints.
func (s *apiServer) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	if s.adminToken == "" || !hmac.Equal([]byte(r.Header.Get("X-Admin-Token")), []byte(s.adminToken)) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return false
	}
	return true
}

// GET /api/admin/reviews?notified=false — moderation list with private fields.
func (s *apiServer) handleAdminListReviews(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	s.store.mu.Lock()
	reviews := s.store.sortedReviews()
	out := make([]*Review, 0, len(reviews))
	for _, rev := range reviews {
		if f := r.URL.Query().Get("notified"); f != "" && rev.Notified != (f == "true") {
			continue
		}
		out = append(out, rev)
	}
	s.store.mu.Unlock()
	writeJSON(w, http.StatusOK, out)
}

// POST /api/admin/reviews — trusted insert (bot or manual).
func (s *apiServer) handleAdminCreateReview(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4<<20) // allow inline avatar
	var req adminReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Rating = clampRating(req.Rating)
	req.Text = strings.TrimSpace(req.Text)
	req.Identity = strings.TrimSpace(req.Identity)
	req.Author = strings.TrimSpace(req.Author)

	if req.Identity == "" {
		if req.TGID != 0 {
			req.Identity = "tg:" + itoa64(req.TGID)
		} else {
			req.Identity = "manual:" + newID()
		}
	}

	// bot reviews honour cooldown per telegram id; manual is exempt
	if req.Source == string(SourceBot) && req.TGID != 0 {
		if left := s.cooldownLeft("tg:" + itoa64(req.TGID)); left > 0 {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "cooldown", "retry": itoa(left)})
			return
		}
	}

	rev := &Review{
		Rating:     req.Rating,
		Text:       req.Text,
		Author:     req.Author,
		Source:     ReviewSource(req.Source),
		Identity:   req.Identity,
		TGID:       req.TGID,
		TGUsername: req.TGUsername,
	}
	if rev.Source == "" {
		rev.Source = SourceManual
	}
	if rev.Author == "" {
		rev.Author = "Guest"
	}

	if req.AvatarB64 != "" {
		if path, err := s.saveAvatar(req.AvatarB64, req.AvatarExt); err == nil {
			rev.AvatarPath = path
			rev.HasAvatar = true
		}
	}

	s.store.mu.Lock()
	if existing := s.store.findByIdentity(req.Identity); existing != nil {
		rev.EditToken = existing.EditToken
	}
	err := s.store.upsertReview(rev)
	if stored := s.store.findByIdentity(req.Identity); stored != nil {
		rev = stored
	}
	s.store.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save failed"})
		return
	}
	if req.Source == string(SourceBot) && req.TGID != 0 {
		s.touchCooldown("tg:" + itoa64(req.TGID))
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": rev.ID, "edit_token": rev.EditToken})
}

// saveAvatar decodes a base64 image and stores it under the avatars dir.
func (s *apiServer) saveAvatar(b64, ext string) (string, error) {
	ext = strings.ToLower(strings.TrimPrefix(ext, "."))
	if ext == "" {
		ext = "jpg"
	}
	if ext != "jpg" && ext != "jpeg" && ext != "png" && ext != "webp" {
		ext = "jpg"
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(b64, "data:image/"))
	if err != nil {
		// try raw (strip any data: prefix payload)
		if i := strings.Index(b64, ","); i >= 0 {
			data, err = base64.StdEncoding.DecodeString(b64[i+1:])
		}
		if err != nil {
			return "", err
		}
	}
	if len(data) == 0 || len(data) > 2<<20 {
		return "", errors.New("bad avatar size")
	}
	id := newID()
	path := filepath.Join(s.store.dir, "avatars", id+"."+ext)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", err
	}
	return path, nil
}

// DELETE /api/admin/reviews/{id} — remove a review.
func (s *apiServer) handleAdminDeleteReview(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	id := r.PathValue("id")
	s.store.mu.Lock()
	err := s.store.deleteReview(id)
	s.store.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// PUT /api/admin/reviews/{id}/notified — mark admin pinged.
func (s *apiServer) handleAdminMarkNotified(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	id := r.PathValue("id")
	s.store.mu.Lock()
	if rev := s.store.find(id); rev != nil {
		rev.Notified = true
		_ = s.store.saveReviews()
	}
	s.store.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /api/admin/blocks — list blocks.
func (s *apiServer) handleAdminListBlocks(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	s.store.mu.Lock()
	out := make([]*Block, len(s.store.blocks))
	copy(out, s.store.blocks)
	s.store.mu.Unlock()
	writeJSON(w, http.StatusOK, out)
}

type blockRequest struct {
	Kind   string `json:"kind"`
	Value  string `json:"value"`
	Reason string `json:"reason"`
}

// POST /api/admin/blocks — ban an ip or device.
func (s *apiServer) handleAdminAddBlock(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
	var req blockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	req.Kind = strings.ToLower(strings.TrimSpace(req.Kind))
	req.Value = strings.TrimSpace(req.Value)
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Kind == "device" {
		req.Value = strings.TrimPrefix(req.Value, "dev:")
	}
	if (req.Kind != "ip" && req.Kind != "device") || req.Value == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "kind must be ip|device and value required"})
		return
	}
	if req.Reason == "" {
		req.Reason = "Violation of the rules"
	}
	s.store.mu.Lock()
	b, err := s.store.addBlock(req.Kind, req.Value, req.Reason)
	s.store.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save failed"})
		return
	}
	writeJSON(w, http.StatusOK, b)
}

// DELETE /api/admin/blocks/{id} — unban.
func (s *apiServer) handleAdminRemoveBlock(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	id := r.PathValue("id")
	s.store.mu.Lock()
	err := s.store.removeBlock(id)
	s.store.mu.Unlock()
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func clampRating(n int) int {
	if n < 1 {
		return 1
	}
	if n > 5 {
		return 5
	}
	return n
}

func itoa(n int) string     { return strconv.Itoa(n) }
func itoa64(n int64) string { return strconv.FormatInt(n, 10) }
