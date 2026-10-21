package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"sync"
	"time"
)

// ReviewSource identifies where a review came from.
type ReviewSource string

const (
	SourceSite   ReviewSource = "site"
	SourceBot    ReviewSource = "bot"
	SourceManual ReviewSource = "manual"
)

// Review is a user-submitted rating + comment.
//
// Fields marked "private" are used only for moderation: they are never sent
// to the public list endpoint and are visible only through the admin API.
type Review struct {
	ID         string       `json:"id"`
	Rating     int          `json:"rating"` // 1..5
	Text       string       `json:"text"`
	Author     string       `json:"author"`
	Source     ReviewSource `json:"source"`
	Identity   string       `json:"identity"`           // private: "dev:<uuid>" or "tg:<id>"
	TGID       int64        `json:"tg_id,omitempty"`    // private: telegram user id (bot reviews)
	TGUsername string       `json:"tg_username,omitempty"`
	IP         string       `json:"ip,omitempty"`       // private: moderation
	UserAgent  string       `json:"user_agent,omitempty"` // private: moderation
	AvatarPath string       `json:"avatar_path,omitempty"` // private: on-disk avatar file
	HasAvatar  bool         `json:"has_avatar"`
	EditToken  string       `json:"edit_token,omitempty"` // private: secret for author edits
	Notified   bool         `json:"notified"`            // private: admin was pinged
	CreatedAt  time.Time    `json:"created_at"`
	UpdatedAt  time.Time    `json:"updated_at"`
}

// Block restricts access by IP or device.
type Block struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"` // "ip" | "device"
	Value     string    `json:"value"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"created_at"`
}

// Aggregate is the public rating summary used for the site diagram.
type Aggregate struct {
	Avg   float64        `json:"avg"`
	Count int            `json:"count"`
	Dist  map[string]int `json:"dist"` // "1".."5" -> count
}

// publicView strips private moderation fields before JSON encoding.
type publicView struct {
	ID        string       `json:"id"`
	Rating    int          `json:"rating"`
	Text      string       `json:"text"`
	Author    string       `json:"author"`
	Source    ReviewSource `json:"source"`
	HasAvatar bool         `json:"has_avatar"`
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time    `json:"updated_at"`
}

func (r *Review) public() publicView {
	return publicView{
		ID:        r.ID,
		Rating:    r.Rating,
		Text:      r.Text,
		Author:    r.Author,
		Source:    r.Source,
		HasAvatar: r.HasAvatar,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
	}
}

func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func dataDir() string {
	if v := os.Getenv("XDL_DATA_DIR"); v != "" {
		return v
	}
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	return filepath.Join(base, "xdownload")
}

// store persists reviews, blocks and activity to JSON files. It is the single
// writer; the CLI commands talk to the running API over HTTP rather than
// touching these files directly.
type store struct {
	mu       sync.Mutex
	dir      string
	reviews  []*Review
	blocks   []*Block
	activity map[string]time.Time // identity -> last seen
}

func newStore(dir string) *store {
	s := &store{
		dir:      dir,
		activity: make(map[string]time.Time),
	}
	_ = os.MkdirAll(filepath.Join(dir, "avatars"), 0o755)
	s.load()
	return s
}

func (s *store) reviewsPath() string { return filepath.Join(s.dir, "reviews.json") }
func (s *store) blocksPath() string  { return filepath.Join(s.dir, "blocks.json") }
func (s *store) activityPath() string { return filepath.Join(s.dir, "activity.json") }

func (s *store) load() {
	s.reviews = readJSON[[]*Review](s.reviewsPath())
	s.blocks = readJSON[[]*Block](s.blocksPath())
	s.activity = readJSON[map[string]time.Time](s.activityPath())
	if s.activity == nil {
		s.activity = make(map[string]time.Time)
	}
}

// readJSON reads a JSON file into T, returning nil on any error.
func readJSON[T any](path string) T {
	var out T
	b, err := os.ReadFile(path)
	if err != nil {
		return out
	}
	if err := json.Unmarshal(b, &out); err != nil {
		return out
	}
	return out
}

// writeJSONAtomic writes v to path via a temp file + rename so a crash never
// leaves a half-written file behind.
func writeJSONAtomic(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (s *store) saveReviews() error {
	return writeJSONAtomic(s.reviewsPath(), s.reviews)
}

func (s *store) saveBlocks() error {
	return writeJSONAtomic(s.blocksPath(), s.blocks)
}

func (s *store) saveActivity() error {
	return writeJSONAtomic(s.activityPath(), s.activity)
}

func (s *store) find(id string) *Review {
	for _, r := range s.reviews {
		if r.ID == id {
			return r
		}
	}
	return nil
}

func (s *store) findByIdentity(identity string) *Review {
	for _, r := range s.reviews {
		if r.Identity == identity {
			return r
		}
	}
	return nil
}

// aggregate computes the public rating summary over non-deleted reviews.
func (s *store) aggregate() Aggregate {
	dist := map[string]int{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
	sum, n := 0, 0
	for _, r := range s.reviews {
		if r.Rating < 1 || r.Rating > 5 {
			continue
		}
		dist[strconv.Itoa(r.Rating)]++
		sum += r.Rating
		n++
	}
	avg := 0.0
	if n > 0 {
		avg = float64(sum) / float64(n)
	}
	return Aggregate{Avg: avg, Count: n, Dist: dist}
}

// sortedReviews returns reviews newest-first.
func (s *store) sortedReviews() []*Review {
	out := make([]*Review, len(s.reviews))
	copy(out, s.reviews)
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out
}

func (s *store) upsertReview(r *Review) error {
	if existing := s.findByIdentity(r.Identity); existing != nil {
		existing.Rating = r.Rating
		existing.Text = r.Text
		existing.UpdatedAt = time.Now().UTC()
		if r.Author != "" {
			existing.Author = r.Author
		}
		if r.TGUsername != "" {
			existing.TGUsername = r.TGUsername
		}
		if r.TGID != 0 {
			existing.TGID = r.TGID
		}
		if r.IP != "" {
			existing.IP = r.IP
		}
		if r.UserAgent != "" {
			existing.UserAgent = r.UserAgent
		}
		if r.AvatarPath != "" {
			if existing.AvatarPath != "" && existing.AvatarPath != r.AvatarPath {
				_ = os.Remove(existing.AvatarPath)
			}
			existing.AvatarPath = r.AvatarPath
			existing.HasAvatar = true
		}
		existing.Notified = false // re-notify on edit
		return s.saveReviews()
	}
	r.CreatedAt = time.Now().UTC()
	r.UpdatedAt = r.CreatedAt
	if r.ID == "" {
		r.ID = newID()
	}
	if r.EditToken == "" {
		r.EditToken = newID()
	}
	s.reviews = append(s.reviews, r)
	return s.saveReviews()
}

func (s *store) deleteReview(id string) error {
	for i, r := range s.reviews {
		if r.ID == id {
			if r.AvatarPath != "" {
				_ = os.Remove(r.AvatarPath)
			}
			s.reviews = append(s.reviews[:i], s.reviews[i+1:]...)
			return s.saveReviews()
		}
	}
	return errors.New("not found")
}

func (s *store) blockBy(kind, value string) *Block {
	for _, b := range s.blocks {
		if b.Kind == kind && b.Value == value {
			return b
		}
	}
	return nil
}

func (s *store) addBlock(kind, value, reason string) (*Block, error) {
	if b := s.blockBy(kind, value); b != nil {
		return b, nil
	}
	b := &Block{ID: newID(), Kind: kind, Value: value, Reason: reason, CreatedAt: time.Now().UTC()}
	s.blocks = append(s.blocks, b)
	return b, s.saveBlocks()
}

func (s *store) removeBlock(id string) error {
	for i, b := range s.blocks {
		if b.ID == id {
			s.blocks = append(s.blocks[:i], s.blocks[i+1:]...)
			return s.saveBlocks()
		}
	}
	return errors.New("not found")
}

// touchActivity records the last time an identity was seen (throttled).
func (s *store) touchActivity(identity string) {
	if identity == "" {
		return
	}
	now := time.Now().UTC()
	if last, ok := s.activity[identity]; ok && now.Sub(last) < time.Minute {
		return
	}
	s.activity[identity] = now
	if len(s.activity) > 10000 {
		cutoff := now.Add(-30 * 24 * time.Hour)
		for k, t := range s.activity {
			if t.Before(cutoff) {
				delete(s.activity, k)
			}
		}
	}
	_ = s.saveActivity()
}

func (s *store) lastSeen(identity string) (time.Time, bool) {
	t, ok := s.activity[identity]
	return t, ok
}
