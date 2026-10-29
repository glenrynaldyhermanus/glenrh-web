// Command notes-api keeps the sticky notes visitors leave in The Book of Glen.
//
// Every note is appended to all.json, the full archive. top.json holds the
// latest ten, newest first, and is the only file the site reads: Nginx serves
// it as a plain static file, so this service only handles writes.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	topSize    = 10
	maxBody    = 4 << 10
	maxName    = 40
	maxRole    = 60
	maxMessage = 280
	perMinute  = 1
	perDay     = 10
)

type Note struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Role      string    `json:"role,omitempty"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"createdAt"`
}

func main() {
	port := flag.String("port", env("PORT", "8080"), "port to listen on")
	dir := flag.String("data", env("NOTES_DIR", "/data/notes"), "directory holding all.json and top.json")
	static := flag.String("static", "", "also serve the site from this directory (local development)")
	flag.Parse()

	store, err := openStore(*dir)
	if err != nil {
		log.Fatalf("notes: %v", err)
	}

	limiter := newLimiter()
	mux := http.NewServeMux()
	mux.Handle("POST /api/notes", postNote(store, limiter))
	if *static != "" {
		mux.HandleFunc("GET /notes/top.json", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-cache")
			http.ServeFile(w, r, filepath.Join(store.dir, "top.json"))
		})
		mux.Handle("/", http.FileServer(http.Dir(*static)))
	}

	srv := &http.Server{
		Addr:              ":" + *port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go limiter.sweep(ctx)
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(shutdown)
	}()

	log.Printf("notes: listening on :%s, data in %s", *port, store.dir)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("notes: %v", err)
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

/* ---------- Handler ---------- */

type noteRequest struct {
	Name    string `json:"name"`
	Role    string `json:"role"`
	Message string `json:"message"`
	Website string `json:"website"` // honeypot: people never see this field, bots fill it in
}

// postNote takes JSON from the page script, or a plain form post when the
// reader has no JavaScript; those get sent back to the board.
func postNote(store *store, limiter *limiter) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBody)
		isForm := strings.HasPrefix(r.Header.Get("Content-Type"), "application/x-www-form-urlencoded")
		answer := func(status int, v any) {
			if !isForm {
				reply(w, status, v)
			} else if status == http.StatusCreated {
				http.Redirect(w, r, "/guestbook/#board", http.StatusSeeOther)
			} else {
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				w.WriteHeader(status)
				io.WriteString(w, v.(map[string]string)["error"]+"\n")
			}
		}

		var req noteRequest
		var err error
		if isForm {
			if err = r.ParseForm(); err == nil {
				req = noteRequest{Name: r.PostForm.Get("name"), Role: r.PostForm.Get("role"), Message: r.PostForm.Get("message"), Website: r.PostForm.Get("website")}
			}
		} else {
			err = json.NewDecoder(r.Body).Decode(&req)
		}
		if err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				answer(http.StatusRequestEntityTooLarge, problem("That note is too long."))
				return
			}
			answer(http.StatusBadRequest, problem("That didn't look like a note."))
			return
		}

		note, msg := validate(req)
		if msg != "" {
			answer(http.StatusBadRequest, problem(msg))
			return
		}

		// Bots get a convincing answer and nothing is kept.
		if strings.TrimSpace(req.Website) != "" {
			note.ID = newID()
			note.CreatedAt = time.Now().UTC()
			answer(http.StatusCreated, note)
			return
		}

		if wait := limiter.allow(clientIP(r), time.Now()); wait > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
			answer(http.StatusTooManyRequests, problem("Easy there. Give it a minute before the next note."))
			return
		}

		saved, err := store.add(note)
		if err != nil {
			log.Printf("notes: save: %v", err)
			answer(http.StatusInternalServerError, problem("The note didn't stick. Try again in a moment."))
			return
		}
		answer(http.StatusCreated, saved)
	})
}

func validate(req noteRequest) (Note, string) {
	n := Note{
		Name:    clean(req.Name, false),
		Role:    clean(req.Role, false),
		Message: clean(req.Message, true),
	}
	switch {
	case n.Name == "":
		return n, "Tell Glen who you are."
	case utf8.RuneCountInString(n.Name) > maxName:
		return n, "Your name is a little long for a sticky note."
	case utf8.RuneCountInString(n.Role) > maxRole:
		return n, "Your role is a little long for a sticky note."
	case n.Message == "":
		return n, "Write a few words on the note."
	case utf8.RuneCountInString(n.Message) > maxMessage:
		return n, "Keep it under 280 characters."
	}
	return n, ""
}

// clean trims the text and drops control and invisible format characters.
// Messages may keep line breaks, but never more than one blank line in a row.
func clean(s string, multiline bool) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	var b strings.Builder
	newlines := 0
	for _, r := range s {
		if r == '\n' && multiline {
			if newlines < 2 {
				b.WriteRune(r)
			}
			newlines++
			continue
		}
		if r == '\n' || r == '\t' {
			r = ' '
		}
		if unicode.IsControl(r) || unicode.In(r, unicode.Cf) {
			continue
		}
		newlines = 0
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}

func clientIP(r *http.Request) string {
	if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func reply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func problem(msg string) map[string]string {
	return map[string]string{"error": msg}
}

func newID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

/* ---------- Store ---------- */

type store struct {
	mu  sync.Mutex
	dir string
}

func openStore(dir string) (*store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	s := &store{dir: dir}
	// Publish top.json straight away so the site reads [] instead of a 404.
	notes, err := s.read()
	if err != nil {
		return nil, err
	}
	if err := s.writeJSON("top.json", latest(notes, topSize)); err != nil {
		return nil, err
	}
	return s, nil
}

// add re-reads the archive on every write, so hand edits to all.json (say,
// removing a note) are picked up without a restart.
func (s *store) add(n Note) (Note, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	notes, err := s.read()
	if err != nil {
		return Note{}, err
	}
	n.ID = newID()
	n.CreatedAt = time.Now().UTC().Truncate(time.Second)
	notes = append(notes, n)

	if err := s.writeJSON("all.json", notes); err != nil {
		return Note{}, err
	}
	if err := s.writeJSON("top.json", latest(notes, topSize)); err != nil {
		return Note{}, err
	}
	return n, nil
}

func (s *store) read() ([]Note, error) {
	data, err := os.ReadFile(filepath.Join(s.dir, "all.json"))
	if errors.Is(err, os.ErrNotExist) {
		return []Note{}, nil
	}
	if err != nil {
		return nil, err
	}
	var notes []Note
	if err := json.Unmarshal(data, &notes); err != nil {
		return nil, err
	}
	return notes, nil
}

// writeJSON replaces the file in one rename, so Nginx never serves half a file.
func (s *store) writeJSON(name string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(s.dir, "."+name+"-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(append(data, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), filepath.Join(s.dir, name))
}

// latest returns up to n notes, newest first.
func latest(notes []Note, n int) []Note {
	out := make([]Note, 0, n)
	for i := len(notes) - 1; i >= 0 && len(out) < n; i-- {
		out = append(out, notes[i])
	}
	return out
}

/* ---------- Rate limit ---------- */

type visitor struct {
	last  time.Time
	day   string
	count int
}

type limiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
}

func newLimiter() *limiter {
	return &limiter{visitors: map[string]*visitor{}}
}

// allow records a note from ip and returns zero, or how long to wait.
func (l *limiter) allow(ip string, now time.Time) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()

	day := now.UTC().Format(time.DateOnly)
	v := l.visitors[ip]
	if v == nil {
		v = &visitor{}
		l.visitors[ip] = v
	}
	if v.day != day {
		v.day, v.count = day, 0
	}
	if v.count >= perDay {
		tomorrow := now.UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
		return tomorrow.Sub(now)
	}
	if gap := time.Minute / perMinute; !v.last.IsZero() && now.Sub(v.last) < gap {
		return gap - now.Sub(v.last)
	}
	v.last = now
	v.count++
	return 0
}

// sweep forgets visitors who haven't written for a day.
func (l *limiter) sweep(ctx context.Context) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			l.mu.Lock()
			for ip, v := range l.visitors {
				if now.Sub(v.last) > 24*time.Hour {
					delete(l.visitors, ip)
				}
			}
			l.mu.Unlock()
		}
	}
}
