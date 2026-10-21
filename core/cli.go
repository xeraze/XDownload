package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// The CLI never touches the JSON store directly: the API process is the single
// writer, so every admin command goes over HTTP with the admin token.

const adminTokenFile = ".admin-token"

func resolveAdminToken(explicit string) string {
	if explicit != "" {
		return explicit
	}
	if v := os.Getenv("XDL_ADMIN_TOKEN"); v != "" {
		return v
	}
	for _, dir := range tokenSearchDirs() {
		p := filepath.Join(dir, adminTokenFile)
		b, err := os.ReadFile(p)
		if err == nil && strings.TrimSpace(string(b)) != "" {
			return strings.TrimSpace(string(b))
		}
	}
	return ""
}

func tokenSearchDirs() []string {
	cwd, _ := os.Getwd()
	dirs := []string{cwd}
	if exe, err := os.Executable(); err == nil {
		d := filepath.Dir(exe)
		dirs = append(dirs, d, filepath.Dir(d))
	}
	if cfg, err := os.UserConfigDir(); err == nil {
		dirs = append(dirs, filepath.Join(cfg, "xdownload"))
	}
	return dirs
}

func apiBase(explicit string) string {
	base := explicit
	if base == "" {
		base = envOr("XDL_API_ADDR", "127.0.0.1:8083")
	}
	if !strings.Contains(base, "://") {
		base = "http://" + base
	}
	return strings.TrimRight(base, "/")
}

func adminDo(method, base, token, path string, body any) (int, []byte, error) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, base+path, rdr)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("X-Admin-Token", token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, out, nil
}

func adminOut(code int, body []byte, err error) int {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		return 1
	}
	var pretty bytes.Buffer
	if json.Indent(&pretty, body, "", "  ") == nil {
		fmt.Println(pretty.String())
	} else {
		fmt.Println(string(body))
	}
	if code >= 400 {
		fmt.Fprintf(os.Stderr, "server returned %d\n", code)
		return 1
	}
	return 0
}

func cmdReview(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, `usage:
  xcore review list                      all reviews incl. moderation fields
  xcore review add -rating N -text TXT   manual review (-author, -source, -tg-id, -tg-username, -avatar FILE)
  xcore review delete <id>               remove a review`)
		return 2
	}
	sub, rest := args[0], args[1:]
	fs := flag.NewFlagSet("review", flag.ExitOnError)
	api := fs.String("api", "", "api base url (env XDL_API_ADDR)")
	token := fs.String("token", "", "admin token (env XDL_ADMIN_TOKEN or .admin-token file)")

	switch sub {
	case "list":
		fs.Parse(rest)
		base := apiBase(*api)
		tok := resolveAdminToken(*token)
		if tok == "" {
			fmt.Fprintln(os.Stderr, "error: no admin token (set XDL_ADMIN_TOKEN or create .admin-token)")
			return 1
		}
		code, body, err := adminDo("GET", base, tok, "/api/admin/reviews", nil)
		return adminOut(code, body, err)

	case "add":
		rating := fs.Int("rating", 0, "1..5")
		text := fs.String("text", "", "review text")
		author := fs.String("author", "", "display name")
		source := fs.String("source", "manual", "site|bot|manual")
		tgID := fs.Int64("tg-id", 0, "telegram user id")
		tgUser := fs.String("tg-username", "", "telegram username")
		avatar := fs.String("avatar", "", "path to avatar image file")
		fs.Parse(rest)
		base := apiBase(*api)
		tok := resolveAdminToken(*token)
		if tok == "" {
			fmt.Fprintln(os.Stderr, "error: no admin token (set XDL_ADMIN_TOKEN or create .admin-token)")
			return 1
		}
		if *rating < 1 || *rating > 5 {
			fmt.Fprintln(os.Stderr, "error: -rating must be 1..5")
			return 2
		}
		if strings.TrimSpace(*text) == "" {
			fmt.Fprintln(os.Stderr, "error: -text is required")
			return 2
		}
		body := map[string]any{
			"rating": *rating,
			"text":   *text,
			"source": *source,
		}
		if *author != "" {
			body["author"] = *author
		}
		if *tgID != 0 {
			body["tg_id"] = *tgID
		}
		if *tgUser != "" {
			body["tg_username"] = *tgUser
		}
		if *avatar != "" {
			data, err := os.ReadFile(*avatar)
			if err != nil {
				fmt.Fprintln(os.Stderr, "error: avatar:", err)
				return 1
			}
			body["avatar_b64"] = base64.StdEncoding.EncodeToString(data)
			body["avatar_ext"] = strings.TrimPrefix(filepath.Ext(*avatar), ".")
		}
		code, out, err := adminDo("POST", base, tok, "/api/admin/reviews", body)
		return adminOut(code, out, err)

	case "delete":
		fs.Parse(rest)
		id := fs.Arg(0)
		if id == "" {
			fmt.Fprintln(os.Stderr, "usage: xcore review delete <id>")
			return 2
		}
		base := apiBase(*api)
		tok := resolveAdminToken(*token)
		if tok == "" {
			fmt.Fprintln(os.Stderr, "error: no admin token")
			return 1
		}
		code, body, err := adminDo("DELETE", base, tok, "/api/admin/reviews/"+url.PathEscape(id), nil)
		return adminOut(code, body, err)

	default:
		fmt.Fprintln(os.Stderr, "unknown review subcommand:", sub)
		return 2
	}
}

func cmdBlock(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, `usage:
  xcore block list                       all blocks
  xcore block add ip|device <value>      ban (optional -reason "...")
  xcore block remove <id>                unban`)
		return 2
	}
	sub, rest := args[0], args[1:]
	fs := flag.NewFlagSet("block", flag.ExitOnError)
	api := fs.String("api", "", "api base url (env XDL_API_ADDR)")
	token := fs.String("token", "", "admin token")
	reason := fs.String("reason", "", "ban reason shown to the user")

	switch sub {
	case "list":
		fs.Parse(rest)
		base := apiBase(*api)
		tok := resolveAdminToken(*token)
		if tok == "" {
			fmt.Fprintln(os.Stderr, "error: no admin token")
			return 1
		}
		code, body, err := adminDo("GET", base, tok, "/api/admin/blocks", nil)
		return adminOut(code, body, err)

	case "add":
		fs.Parse(rest)
		kind := fs.Arg(0)
		value := fs.Arg(1)
		if (kind != "ip" && kind != "device") || value == "" {
			fmt.Fprintln(os.Stderr, "usage: xcore block add ip|device <value> [-reason \"...\"]")
			return 2
		}
		base := apiBase(*api)
		tok := resolveAdminToken(*token)
		if tok == "" {
			fmt.Fprintln(os.Stderr, "error: no admin token")
			return 1
		}
		body := map[string]string{"kind": kind, "value": value, "reason": *reason}
		code, out, err := adminDo("POST", base, tok, "/api/admin/blocks", body)
		return adminOut(code, out, err)

	case "remove":
		fs.Parse(rest)
		id := fs.Arg(0)
		if id == "" {
			fmt.Fprintln(os.Stderr, "usage: xcore block remove <id>")
			return 2
		}
		base := apiBase(*api)
		tok := resolveAdminToken(*token)
		if tok == "" {
			fmt.Fprintln(os.Stderr, "error: no admin token")
			return 1
		}
		code, body, err := adminDo("DELETE", base, tok, "/api/admin/blocks/"+url.PathEscape(id), nil)
		return adminOut(code, body, err)

	default:
		fmt.Fprintln(os.Stderr, "unknown block subcommand:", sub)
		return 2
	}
}
