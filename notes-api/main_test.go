package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestValidate(t *testing.T) {
	cases := []struct {
		name string
		req  noteRequest
		ok   bool
	}{
		{"fine", noteRequest{Name: "Ana", Role: "CTO", Message: "Lovely book!"}, true},
		{"no role", noteRequest{Name: "Ana", Message: "Hi"}, true},
		{"no name", noteRequest{Name: "  ", Message: "Hi"}, false},
		{"no message", noteRequest{Name: "Ana", Message: "\u200b\n"}, false},
		{"long name", noteRequest{Name: strings.Repeat("a", maxName+1), Message: "Hi"}, false},
		{"long message", noteRequest{Name: "Ana", Message: strings.Repeat("é", maxMessage+1)}, false},
		{"max message", noteRequest{Name: "Ana", Message: strings.Repeat("é", maxMessage)}, true},
	}
	for _, c := range cases {
		_, msg := validate(c.req)
		if (msg == "") != c.ok {
			t.Errorf("%s: got %q", c.name, msg)
		}
	}
}

func TestClean(t *testing.T) {
	if got := clean("  Ana\x00\tB\u202e ", false); got != "Ana B" {
		t.Errorf("single line: %q", got)
	}
	if got := clean("a\r\n\n\n\nb", true); got != "a\n\nb" {
		t.Errorf("multiline: %q", got)
	}
}

func TestLimiter(t *testing.T) {
	l := newLimiter()
	now := time.Date(2026, 10, 29, 10, 0, 0, 0, time.UTC)
	if l.allow("1.2.3.4", now) != 0 {
		t.Fatal("first note should pass")
	}
	if l.allow("1.2.3.4", now.Add(20*time.Second)) == 0 {
		t.Fatal("second note within a minute should wait")
	}
	if l.allow("5.6.7.8", now) != 0 {
		t.Fatal("another visitor should pass")
	}
	for i := 1; i < perDay; i++ {
		if l.allow("1.2.3.4", now.Add(time.Duration(i)*2*time.Minute)) != 0 {
			t.Fatalf("note %d should pass", i+1)
		}
	}
	if l.allow("1.2.3.4", now.Add(time.Hour)) == 0 {
		t.Fatal("daily cap should hold")
	}
	if l.allow("1.2.3.4", now.Add(24*time.Hour)) != 0 {
		t.Fatal("cap should reset the next day")
	}
}

func TestPostKeepsArchiveAndLatestTen(t *testing.T) {
	dir := t.TempDir()
	s, err := openStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	h := postNote(s, newLimiter())

	for i := 0; i < 12; i++ {
		body, _ := json.Marshal(noteRequest{Name: "Visitor", Message: "Note <script>" + string(rune('a'+i))})
		req := httptest.NewRequest(http.MethodPost, "/api/notes", bytes.NewReader(body))
		req.Header.Set("X-Real-IP", fmt.Sprintf("10.0.0.%d", i))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("note %d: status %d %s", i, rec.Code, rec.Body)
		}
	}

	var all, top []Note
	readJSON(t, filepath.Join(dir, "all.json"), &all)
	readJSON(t, filepath.Join(dir, "top.json"), &top)
	if len(all) != 12 || len(top) != topSize {
		t.Fatalf("all=%d top=%d", len(all), len(top))
	}
	if top[0].Message != all[11].Message || top[9].Message != all[2].Message {
		t.Fatal("top.json should be the latest ten, newest first")
	}
	if all[0].Message != "Note <script>a" {
		t.Fatalf("text should be kept as written, got %q", all[0].Message)
	}
}

func TestHoneypotIsNotStored(t *testing.T) {
	dir := t.TempDir()
	s, _ := openStore(dir)
	body := `{"name":"Bot","message":"buy now","website":"http://spam"}`
	rec := httptest.NewRecorder()
	postNote(s, newLimiter()).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/notes", strings.NewReader(body)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status %d", rec.Code)
	}
	if _, err := os.Stat(filepath.Join(dir, "all.json")); !os.IsNotExist(err) {
		t.Fatal("honeypot note should not be archived")
	}
}

func TestFormPostRedirectsToBoard(t *testing.T) {
	s, _ := openStore(t.TempDir())
	h := postNote(s, newLimiter())

	post := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/notes", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	if rec := post("name=Ana&role=PM&message=Hello+Glen"); rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/guestbook/#board" {
		t.Fatalf("status %d, location %q", rec.Code, rec.Header().Get("Location"))
	}
	if rec := post("name=&message=Hi"); rec.Code != http.StatusBadRequest || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/plain") {
		t.Fatalf("status %d, type %q", rec.Code, rec.Header().Get("Content-Type"))
	}
}

func readJSON(t *testing.T, path string, v any) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, v); err != nil {
		t.Fatal(err)
	}
}
