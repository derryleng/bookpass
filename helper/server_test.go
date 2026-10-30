package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func testServer(t *testing.T) *server {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("BOOKPASS_CONFIG_DIR", filepath.Join(dir, "config"))
	t.Setenv("BOOKPASS_DEFAULT_VAULT", filepath.Join(dir, "vault", "bookmarks.kdbx"))
	s, err := newServer()
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func sum(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

// write runs begin, chunk and commit the way the extension does.
func write(s *server, data []byte, expected string) *response {
	s.handle(&request{Op: "writeBegin"})
	half := len(data) / 2
	s.handle(&request{Op: "writeChunk", Data: data[:half]})
	s.handle(&request{Op: "writeChunk", Data: data[half:]})
	return s.handle(&request{Op: "writeCommit", Size: int64(len(data)), SHA256: sum(data), ExpectedSHA: expected})
}

func TestWriteReadRoundTrip(t *testing.T) {
	s := testServer(t)
	if st := s.handle(&request{Op: "exists"}); !st.OK || st.Exists {
		t.Fatalf("new vault should not exist: %+v", st)
	}
	data := bytes.Repeat([]byte("encrypted"), 1000)
	if r := write(s, data, ""); !r.OK {
		t.Fatalf("write failed: %+v", r)
	}
	if ex := s.handle(&request{Op: "exists"}); !ex.Exists || ex.Size != int64(len(data)) {
		t.Fatalf("exists after write: %+v", ex)
	}
	st := s.handle(&request{Op: "stat"})
	if !st.Exists || st.SHA256 != sum(data) || st.Size != int64(len(data)) {
		t.Fatalf("stat after write: %+v", st)
	}
	r := s.handle(&request{Op: "read", Offset: 0, Length: maxChunk})
	if !r.OK || !r.EOF || !bytes.Equal(r.Data, data) {
		t.Fatalf("read back differs: %+v", r.OK)
	}
}

func TestWriteRefusesWhenFileChanged(t *testing.T) {
	s := testServer(t)
	write(s, []byte("version one"), "")
	// Someone else (a sync tool, KeePassXC) replaces the file.
	if err := os.WriteFile(s.cfg.VaultPath, []byte("changed outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	r := write(s, []byte("version two"), sum([]byte("version one")))
	if r.OK || r.Code != codeConflict {
		t.Fatalf("expected a conflict, got %+v", r)
	}
	got, _ := os.ReadFile(s.cfg.VaultPath)
	if string(got) != "changed outside" {
		t.Fatalf("file was overwritten: %q", got)
	}
	// A refused write must not leave temporary files behind.
	entries, _ := os.ReadDir(filepath.Dir(s.cfg.VaultPath))
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".tmp" {
			t.Fatalf("leftover temp file %s", e.Name())
		}
	}
}

func TestWriteRefusesBadChecksum(t *testing.T) {
	s := testServer(t)
	s.handle(&request{Op: "writeBegin"})
	s.handle(&request{Op: "writeChunk", Data: []byte("abc")})
	r := s.handle(&request{Op: "writeCommit", Size: 3, SHA256: "00"})
	if r.OK || r.Code != codeInvalid {
		t.Fatalf("expected invalid, got %+v", r)
	}
	if _, err := os.Stat(s.cfg.VaultPath); err == nil {
		t.Fatal("vault should not exist")
	}
}

func TestBackupsAreKeptAndPruned(t *testing.T) {
	s := testServer(t)
	three := 3
	s.handle(&request{Op: "setConfig", BackupCount: &three})
	prev := ""
	for _, v := range []string{"1", "2", "3", "4", "5", "6"} {
		data := []byte("version " + v)
		if r := write(s, data, prev); !r.OK {
			t.Fatalf("write %s: %+v", v, r)
		}
		prev = sum(data)
	}
	entries, err := os.ReadDir(filepath.Join(filepath.Dir(s.cfg.VaultPath), "backups"))
	if err != nil || len(entries) != 3 {
		t.Fatalf("want 3 backups, got %d (%v)", len(entries), err)
	}
	// The newest backup holds the version before the last write.
	newest := entries[len(entries)-1].Name()
	got, _ := os.ReadFile(filepath.Join(filepath.Dir(s.cfg.VaultPath), "backups", newest))
	if string(got) != "version 5" {
		t.Fatalf("newest backup is %q", got)
	}
}

func TestSetConfig(t *testing.T) {
	s := testServer(t)
	good := filepath.Join(t.TempDir(), "mine.kdbx")
	if r := s.handle(&request{Op: "setConfig", VaultPath: good}); !r.OK || r.VaultPath != good {
		t.Fatalf("good path refused: %+v", r)
	}
	for _, bad := range []string{"relative/path.kdbx", filepath.Join(t.TempDir(), "notes.txt"), t.TempDir()} {
		if r := s.handle(&request{Op: "setConfig", VaultPath: bad}); r.OK {
			t.Fatalf("accepted %q", bad)
		}
	}
	// The setting survives a restart.
	again, err := newServer()
	if err != nil || again.cfg.VaultPath != good {
		t.Fatalf("config not persisted: %v %q", err, again.cfg.VaultPath)
	}
}

func TestReadLimits(t *testing.T) {
	s := testServer(t)
	write(s, []byte("x"), "")
	if r := s.handle(&request{Op: "read", Length: maxChunk + 1}); r.OK {
		t.Fatal("accepted an oversize read")
	}
	if r := s.handle(&request{Op: "nope"}); r.OK || r.Code != codeInvalid {
		t.Fatalf("unknown op: %+v", r)
	}
}

func TestConflictCopiesAreFoundOnlyByTheirMarks(t *testing.T) {
	s := testServer(t)
	write(s, []byte("main"), "")
	dir := filepath.Dir(s.cfg.VaultPath)
	for name, body := range map[string]string{
		"bookmarks.sync-conflict-20260101-120000-ABCDEFG.kdbx": "syncthing",
		"bookmarks (conflicted copy 2026-01-01).kdbx":          "dropbox",
		"bookmarks-work.kdbx":                                  "another vault, not a conflict",
		"notes.sync-conflict-1.kdbx":                           "someone else's file",
	} {
		os.WriteFile(filepath.Join(dir, name), []byte(body), 0o600)
	}
	r := s.handle(&request{Op: "findConflicts"})
	if len(r.Names) != 2 {
		t.Fatalf("found %v", r.Names)
	}

	// Reading a conflict copy works by name, but an arbitrary file name does not.
	st := s.handle(&request{Op: "stat", Source: "conflict", Name: r.Names[0]})
	if !st.OK || !st.Exists {
		t.Fatalf("stat of a conflict copy: %+v", st)
	}
	if bad := s.handle(&request{Op: "read", Source: "conflict", Name: "bookmarks-work.kdbx", Length: 10}); bad.OK {
		t.Fatal("read a file that is not a conflict copy")
	}
	if bad := s.handle(&request{Op: "read", Source: "conflict", Name: `..\..\secret.kdbx`, Length: 10}); bad.OK {
		t.Fatal("read outside the folder")
	}

	// Once merged, a copy is moved away and not offered again.
	if a := s.handle(&request{Op: "archiveConflict", Name: r.Names[0]}); !a.OK {
		t.Fatalf("archive: %+v", a)
	}
	if again := s.handle(&request{Op: "findConflicts"}); len(again.Names) != 1 {
		t.Fatalf("after archiving: %v", again.Names)
	}
}

func TestBackupsCanBeListedAndRead(t *testing.T) {
	s := testServer(t)
	prev := ""
	for _, v := range []string{"one", "two", "three"} {
		data := []byte("version " + v)
		write(s, data, prev)
		prev = sum(data)
	}
	list := s.handle(&request{Op: "listBackups"})
	if len(list.Backups) != 2 {
		t.Fatalf("backups: %+v", list.Backups)
	}
	newest := list.Backups[0].Name
	r := s.handle(&request{Op: "read", Source: "backup", Name: newest, Length: maxChunk})
	if !r.OK || string(r.Data) != "version two" {
		t.Fatalf("read backup: %+v %q", r.OK, r.Data)
	}
	if bad := s.handle(&request{Op: "read", Source: "backup", Name: "../bookmarks.kdbx", Length: 10}); bad.OK {
		t.Fatal("read outside the backups folder")
	}
}

func TestWriteBeginRemovesOnlyStaleTempFiles(t *testing.T) {
	s := testServer(t)
	dir := filepath.Dir(s.cfg.VaultPath)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	stale, fresh := filepath.Join(dir, ".bookpass-old.tmp"), filepath.Join(dir, ".bookpass-new.tmp")
	for _, p := range []string{stale, fresh} {
		if err := os.WriteFile(p, []byte("partial"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	old := time.Now().Add(-2 * time.Hour)
	if err := os.Chtimes(stale, old, old); err != nil {
		t.Fatal(err)
	}
	s.handle(&request{Op: "writeBegin"})
	s.discardUpload()
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Error("a temporary file from an hour ago should be removed")
	}
	if _, err := os.Stat(fresh); err != nil {
		t.Error("a recent temporary file may belong to a save in progress and must stay")
	}
}

func TestNetworkPathsAreRefusedOnWindows(t *testing.T) {
	for _, p := range []string{`\\server\share\vault.kdbx`, `//server/share/vault.kdbx`, `\\?\UNC\server\share\vault.kdbx`} {
		if !isNetworkPath("windows", p) {
			t.Errorf("%q should be a network path on Windows", p)
		}
		if isNetworkPath("linux", p) {
			t.Errorf("%q is not a network path on Linux", p)
		}
	}
	for _, p := range []string{`C:\Users\me\vault.kdbx`, `D:/vault.kdbx`, "/home/me/vault.kdbx"} {
		if isNetworkPath("windows", p) {
			t.Errorf("%q is a local path", p)
		}
	}
}
