package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

const version = "0.1.0"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	var code int
	switch os.Args[1] {
	case "info":
		code = cmdInfo(os.Args[2:])
	case "dl":
		code = cmdDownload(os.Args[2:])
	case "spotify":
		code = cmdSpotify(os.Args[2:])
	case "version":
		fmt.Println("xcore", version)
		code = 0
	default:
		usage()
		code = 2
	}
	os.Exit(code)
}

func usage() {
	fmt.Println(`xcore - XDownload download engine

Usage:
  xcore info <url>                   Print track metadata as JSON
  xcore dl [--dir DIR] [--ext m4a|mp3|mp4] [--height 480|720|1080] <url>
                                     Download audio (m4a/mp3) or video (mp4, --height caps
                                     resolution). Spotify urls auto-route to spotdl (audio only)
  xcore spotify --dir DIR <url>      Download via spotdl
  xcore version`)
}

func cmdInfo(args []string) int {
	fs := flag.NewFlagSet("info", flag.ExitOnError)
	fs.Parse(args)
	url := fs.Arg(0)
	if url == "" {
		fmt.Fprintln(os.Stderr, "usage: xcore info <url>")
		return 2
	}
	info, err := fetchInfo(url)
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		return 1
	}
	b, _ := json.MarshalIndent(info, "", "  ")
	fmt.Println(string(b))
	return 0
}

func cmdDownload(args []string) int {
	fs := flag.NewFlagSet("dl", flag.ExitOnError)
	dir := fs.String("dir", ".", "output directory")
	ext := fs.String("ext", "m4a", "output type: m4a|mp3 (audio) or mp4 (video)")
	height := fs.Int("height", 1080, "max video height in pixels (video only): 480|720|1080")
	fs.Parse(args)
	url := fs.Arg(0)
	if url == "" {
		fmt.Fprintln(os.Stderr, "usage: xcore dl [--dir DIR] [--ext m4a|mp3|mp4] [--height 480|720|1080] <url>")
		return 2
	}
	if isSpotifyURL(url) {
		return downloadSpotify(url, *dir)
	}
	if *ext == "mp4" {
		path, err := downloadVideo(url, *dir, *height)
		if err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			return 1
		}
		if path != "" {
			fmt.Println("RESULT:" + path)
		}
		return 0
	}
	path, err := downloadAudio(url, *ext, *dir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		return 1
	}
	if path != "" {
		fmt.Println("RESULT:" + path)
	}
	return 0
}

func cmdSpotify(args []string) int {
	fs := flag.NewFlagSet("spotify", flag.ExitOnError)
	dir := fs.String("dir", ".", "output directory")
	fs.Parse(args)
	url := fs.Arg(0)
	if url == "" {
		fmt.Fprintln(os.Stderr, "usage: xcore spotify --dir DIR <url>")
		return 2
	}
	return downloadSpotify(url, *dir)
}