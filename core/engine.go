package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type TrackInfo struct {
	Title     string `json:"title"`
	Duration  int    `json:"duration"`
	Uploader  string `json:"uploader"`
	Thumbnail string `json:"thumbnail"`
	URL       string `json:"url"`
	IsSpotify bool   `json:"is_spotify,omitempty"`
}

var spotifyRe = regexp.MustCompile(`(?i)open\.spotify\.com|^spotify:`)

// Spotify's WAF rate-limits spotdl's client for a while (HTTP 403 on the
// session bootstrap). Remember that in a temp file (xcore runs as a fresh
// process per download) and go straight to the yt-dlp fallback instead of
// burning 20-30 s on a doomed spotdl run.
const spotdlBlockWindow = 10 * time.Minute

func spotdlCooldownFile() string {
	return filepath.Join(os.TempDir(), "xdl-spotdl-cooldown")
}

func spotdlBlocked() bool {
	b, err := os.ReadFile(spotdlCooldownFile())
	if err != nil {
		return false
	}
	until, err := strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64)
	if err != nil {
		return false
	}
	return time.Now().Before(time.Unix(until, 0))
}

func markSpotdlBlocked() {
	until := time.Now().Add(spotdlBlockWindow)
	if err := os.WriteFile(spotdlCooldownFile(), []byte(fmt.Sprint(until.Unix())), 0o644); err == nil {
		fmt.Println("spotdl is rate-limited by Spotify, cooling down for", spotdlBlockWindow)
	}
}

// yt-dlp's default YouTube client (with deno as the JS runtime) is the only
// one that both lists formats and serves them without a GVS PO token.
// android_vr used to work for metadata but now returns HTTP 403 on download.
var youtubeClientArgs = [][]string{
	{},
	{"--extractor-args", "youtube:player_client=android"},
}

func ytdlpArgs(extra ...string) []string {
	args := []string{
		"--retries", "3",
		"--fragment-retries", "3",
	}
	return append(args, extra...)
}

func isSpotifyURL(url string) bool {
	return spotifyRe.MatchString(url)
}

func fetchInfo(url string) (*TrackInfo, error) {
	if isSpotifyURL(url) {
		return &TrackInfo{Title: "Spotify track", IsSpotify: true}, nil
	}
	cmd := exec.Command("yt-dlp", ytdlpArgs("--dump-single-json", "--no-playlist", "--no-warnings", "--skip-download", url)...)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("yt-dlp failed (is it installed?): %w", err)
	}
	var raw struct {
		Title      string `json:"title"`
		Duration   int    `json:"duration"`
		Uploader   string `json:"uploader"`
		Thumbnail  string `json:"thumbnail"`
		WebpageURL string `json:"webpage_url"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, err
	}
	return &TrackInfo{
		Title:     raw.Title,
		Duration:  raw.Duration,
		Uploader:  raw.Uploader,
		Thumbnail: raw.Thumbnail,
		URL:       raw.WebpageURL,
	}, nil
}

func downloadAudio(url, ext, dir string) (string, error) {
	args := []string{
		"--newline",
		"--no-playlist",
		"--extract-audio",
		"--audio-format", ext,
		"--audio-quality", "0",
		"--progress-template", "download:[%(progress._percent_str)s] %(progress._speed_str)s",
		"--print", "after_move:FILE:%(filepath)s",
		"-o", filepath.Join(dir, "%(title)s.%(ext)s"),
		url,
	}
	return runYTDLPYouTube(args, dir)
}

func downloadVideo(url, dir string, height int) (string, error) {
	format := fmt.Sprintf("bestvideo[height<=%d][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", height)
	args := []string{
		"--newline",
		"--no-playlist",
		"-f", format,
		"--merge-output-format", "mp4",
		"--progress-template", "download:[%(progress._percent_str)s] %(progress._speed_str)s",
		"--print", "after_move:FILE:%(filepath)s",
		"-o", filepath.Join(dir, "%(title)s.%(ext)s"),
		url,
	}
	return runYTDLPYouTube(args, dir)
}

// runYTDLPYouTube tries the default client first, then android as a fallback.
func runYTDLPYouTube(extra []string, dir string) (string, error) {
	var lastErr error
	for _, client := range youtubeClientArgs {
		args := append(ytdlpArgs(), client...)
		args = append(args, extra...)
		path, err := runYTDLP(args, dir)
		if err == nil {
			return path, nil
		}
		lastErr = err
	}
	return "", lastErr
}

func runYTDLP(args []string, dir string) (string, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	cmd := exec.Command("yt-dlp", args...)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")
	var stdout bytes.Buffer
	cmd.Stdout = io.MultiWriter(os.Stdout, &stdout)
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("yt-dlp failed: %w", err)
	}
	for _, line := range strings.Split(stdout.String(), "\n") {
		if strings.HasPrefix(line, "FILE:") {
			return strings.TrimSpace(strings.TrimPrefix(line, "FILE:")), nil
		}
	}
	return "", fmt.Errorf("yt-dlp finished but no output file was found")
}

func downloadSpotify(url, dir string) int {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		return 1
	}

	// Fast path: track title via Spotify's oEmbed + yt-dlp search (~10 s).
	path, fastErr := spotifyViaYouTube(url, dir)
	if path != "" && fastErr == nil {
		fmt.Println("RESULT:" + path)
		return 0
	}
	if fastErr == nil {
		fastErr = fmt.Errorf("no output file")
	}

	// Slow path: spotdl (proper Spotify metadata), used only when the fast
	// path fails, and gated while Spotify is rate-limiting it.
	if spotdlBlocked() {
		fmt.Fprintln(os.Stderr, "error:", fastErr, "(spotdl cooling down, not tried)")
		return 1
	}
	sub, err := os.MkdirTemp(dir, "spot-")
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		return 1
	}
	defer os.RemoveAll(sub)

	lastErr := runSpotDLOnce(url, sub)
	if lastErr == nil {
		latest, err := newestFile(sub)
		switch {
		case err != nil:
			lastErr = err
		case latest == "":
			lastErr = fmt.Errorf("no output file")
		default:
			final := filepath.Join(dir, filepath.Base(latest))
			if final != latest {
				if err := os.Rename(latest, final); err != nil {
					fmt.Fprintln(os.Stderr, "error:", err)
					return 1
				}
				latest = final
			}
			fmt.Println("RESULT:" + latest)
			return 0
		}
	}

	fmt.Fprintln(os.Stderr, "error: fast path:", fastErr, "; spotdl:", lastErr)
	return 1
}

func runSpotDLOnce(url, sub string) error {
	cmd := exec.Command("spotdl", "download", url, "--output", sub, "--format", "mp3",
		"--bitrate", "320k",
		"--yt-dlp-args", "--extractor-args youtube:player_client=android --retries 3 --fragment-retries 3")
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")
	var out bytes.Buffer
	cmd.Stdout = io.MultiWriter(os.Stdout, &out)
	cmd.Stderr = io.MultiWriter(os.Stdout, &out)
	err := cmd.Run()
	log := out.String()
	if err != nil {
		if strings.Contains(log, "Could not get session") || strings.Contains(log, "Status Code: 403") {
			markSpotdlBlocked()
		}
		return err
	}
	os.Remove(spotdlCooldownFile())
	return nil
}

// spotifyViaYouTube resolves the track title via Spotify's oEmbed endpoint
// (which stays reachable when the main site is rate-limiting) and downloads
// the first matching YouTube result directly with yt-dlp.
func spotifyViaYouTube(link, dir string) (string, error) {
	title, err := oembedTitle(link)
	if err != nil {
		return "", fmt.Errorf("could not fetch track info from Spotify: %w", err)
	}
	fmt.Println("searching YouTube for:", title)
	args := []string{
		"--newline",
		"--no-playlist",
		"--extract-audio",
		"--audio-format", "mp3",
		"--audio-quality", "0",
		"--progress-template", "download:[%(progress._percent_str)s] %(progress._speed_str)s",
		"--print", "after_move:FILE:%(filepath)s",
		"-o", filepath.Join(dir, "%(title)s.%(ext)s"),
		"ytsearch1:" + title,
	}
	return runYTDLPYouTube(args, dir)
}

func oembedTitle(link string) (string, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get("https://open.spotify.com/oembed?url=" + url.QueryEscape(link))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("spotify oembed HTTP %d", resp.StatusCode)
	}
	var payload struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", err
	}
	title := strings.TrimSpace(payload.Title)
	if title == "" {
		return "", fmt.Errorf("no track title in spotify response")
	}
	return title, nil
}

func newestFile(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	var files []string
	for _, e := range entries {
		if e.Type().IsRegular() && strings.EqualFold(filepath.Ext(e.Name()), ".mp3") {
			files = append(files, filepath.Join(dir, e.Name()))
		}
	}
	if len(files) == 0 {
		return "", nil
	}
	sort.Slice(files, func(i, j int) bool {
		si, errI := os.Stat(files[i])
		sj, errJ := os.Stat(files[j])
		if errI != nil || errJ != nil {
			return false
		}
		return si.ModTime().After(sj.ModTime())
	})
	return files[0], nil
}
