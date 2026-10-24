package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// vaultWithBackups makes a vault that has been saved three times, so it has two backups.
func vaultWithBackups(t *testing.T) (*server, []byte) {
	t.Helper()
	s := testServer(t)
	var last []byte
	expected := ""
	for _, text := range []string{"one", "two", "three"} {
		last = []byte(strings.Repeat(text, 500))
		if r := write(s, last, expected); !r.OK {
			t.Fatalf("write failed: %+v", r)
		}
		expected = sum(last)
	}
	if n := len(s.backupList()); n != 2 {
		t.Fatalf("expected 2 backups, got %d", n)
	}
	return s, last
}

func TestMoveVaultCarriesTheFileAndItsBackups(t *testing.T) {
	s, data := vaultWithBackups(t)
	old := s.cfg.VaultPath
	target := filepath.Join(t.TempDir(), "a", "b", "moved.kdbx")

	check := s.handle(&request{Op: "checkPath", VaultPath: target})
	if !check.OK || check.Problem != "" || !strings.HasSuffix(check.Creates, filepath.Join("a")) {
		t.Fatalf("a new nested folder should be usable and reported as created: %+v", check)
	}
	if _, err := os.Stat(filepath.Dir(target)); err == nil {
		t.Fatal("checking must not create anything")
	}

	r := s.handle(&request{Op: "moveVault", VaultPath: target})
	if !r.OK || r.VaultPath != target {
		t.Fatalf("move failed: %+v", r)
	}
	got, err := os.ReadFile(target)
	if err != nil || string(got) != string(data) {
		t.Fatalf("the vault did not arrive intact: %v", err)
	}
	if _, err := os.Stat(old); err == nil {
		t.Fatal("the old file should be gone")
	}
	backups := s.backupList()
	if len(backups) != 2 {
		t.Fatalf("both backups should come along, got %d", len(backups))
	}
	for _, b := range backups {
		if !strings.HasPrefix(b.Name, "moved-") {
			t.Fatalf("backups should be named after the new file: %s", b.Name)
		}
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(old), "backups")); err == nil {
		t.Fatal("the empty old backups folder should be removed")
	}

	// The move is remembered by a helper started later.
	again, err := newServer()
	if err != nil || again.cfg.VaultPath != target {
		t.Fatalf("config did not keep the new path: %v %v", err, again.cfg.VaultPath)
	}
	// And saving carries on at the new place.
	if r := write(s, []byte("four"), sum(data)); !r.OK {
		t.Fatalf("write after move failed: %+v", r)
	}
}

func TestMoveVaultRefusesUnusableTargets(t *testing.T) {
	s, _ := vaultWithBackups(t)
	dir := t.TempDir()
	taken := filepath.Join(dir, "taken.kdbx")
	if err := os.WriteFile(taken, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	notFolder := filepath.Join(dir, "plain.txt")
	if err := os.WriteFile(notFolder, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	cases := map[string]string{
		"relative":     "vault.kdbx",
		"wrong ending": filepath.Join(dir, "vault.txt"),
		"same place":   s.cfg.VaultPath,
		"exists":       taken,
		"a folder":     dir + ".kdbx" + string(os.PathSeparator),
		"under a file": filepath.Join(notFolder, "inside", "vault.kdbx"),
	}
	for name, path := range cases {
		if path == dir+".kdbx"+string(os.PathSeparator) {
			if err := os.MkdirAll(dir+".kdbx", 0o700); err != nil {
				t.Fatal(err)
			}
		}
		if c := s.handle(&request{Op: "checkPath", VaultPath: path}); c.Problem == "" {
			t.Errorf("%s: expected a problem, got none", name)
		}
		if r := s.handle(&request{Op: "moveVault", VaultPath: path}); r.OK {
			t.Errorf("%s: the move should have been refused", name)
		}
	}
	if _, err := os.Stat(s.cfg.VaultPath); err != nil {
		t.Fatal("a refused move must leave the vault where it was")
	}
}

func TestMoveVaultWithNothingToMoveJustPointsThere(t *testing.T) {
	s := testServer(t)
	target := filepath.Join(t.TempDir(), "fresh", "bookmarks.kdbx")
	if r := s.handle(&request{Op: "moveVault", VaultPath: target}); !r.OK || s.cfg.VaultPath != target {
		t.Fatalf("expected the config to point at the new place: %+v", r)
	}
}

func TestPickFolderHook(t *testing.T) {
	s := testServer(t)
	answer := filepath.Join(t.TempDir(), "answer")
	t.Setenv("BOOKPASS_TEST_PICK", answer)
	chosen := filepath.Join(t.TempDir(), "chosen")
	for text, want := range map[string]string{chosen: chosen, "": ""} {
		if err := os.WriteFile(answer, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
		if r := s.handle(&request{Op: "pickFolder"}); !r.OK || r.Path != want {
			t.Fatalf("answer %q: %+v", text, r)
		}
	}
	if err := os.WriteFile(answer, []byte("unavailable"), 0o600); err != nil {
		t.Fatal(err)
	}
	if r := s.handle(&request{Op: "pickFolder"}); r.OK || r.Code != codeUnavailable {
		t.Fatalf("expected the unavailable code: %+v", r)
	}
}
