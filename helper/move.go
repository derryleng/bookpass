package main

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// checkTarget says whether a vault could be put at this path. It returns the cleaned path, the folder that would
// have to be created (the outermost one that is missing, empty if none) and, if the path cannot be used, a plain
// sentence for the person. Nothing is created.
func (s *server) checkTarget(raw string) (path, creates, problem string) {
	path, err := expandPath(raw)
	if err != nil {
		return "", "", err.Error()
	}
	if !strings.EqualFold(filepath.Ext(path), ".kdbx") {
		return path, "", "The file name must end in .kdbx."
	}
	if path == filepath.Clean(s.cfg.VaultPath) {
		return path, "", "The vault is already at that location."
	}
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return path, "", "That is a folder, not a file name."
		}
		return path, "", "A file with that name already exists. Choose another name or folder."
	}
	// Walk up to the nearest folder that exists. Everything below it would be created.
	dir := filepath.Dir(path)
	missing := ""
	for {
		info, err := os.Stat(dir)
		if err == nil {
			if !info.IsDir() {
				return path, "", fmt.Sprintf("%s is a file, not a folder.", dir)
			}
			break
		}
		if !errors.Is(err, fs.ErrNotExist) {
			return path, "", err.Error()
		}
		missing = dir
		parent := filepath.Dir(dir)
		if parent == dir {
			return path, "", "That drive or folder does not exist."
		}
		dir = parent
	}
	// A throwaway file in the folder that exists proves it can be written, then it is removed again.
	probe, err := os.CreateTemp(dir, ".bookpass-check-*")
	if err != nil {
		return path, "", fmt.Sprintf("Cannot write to %s: %v", dir, err)
	}
	probe.Close()
	os.Remove(probe.Name())
	return path, missing, ""
}

// checkPath answers whether a new vault location is usable, so the person can be told before anything moves.
func (s *server) checkPath(req *request) *response {
	path, creates, problem := s.checkTarget(req.VaultPath)
	return &response{ID: req.ID, OK: true, Path: path, Creates: creates, Problem: problem}
}

// moveVault puts the vault, and the backups that belong to it, at a new place and points the config there. The
// new file is copied and checked before the old one is removed, so a failure part way leaves the vault where it was.
func (s *server) moveVault(req *request) *response {
	if s.up != nil {
		return fail(req.ID, codeInvalid, "a save is in progress")
	}
	to, _, problem := s.checkTarget(req.VaultPath)
	if problem != "" {
		return fail(req.ID, codeInvalid, problem)
	}
	from := s.cfg.VaultPath
	oldBackups, oldDir, oldBase := s.backupList(), s.backupDir(), s.vaultBase()

	if err := os.MkdirAll(filepath.Dir(to), 0o700); err != nil {
		return fail(req.ID, codeIO, err.Error())
	}
	hadVault := false
	if want, err := fileHash(from); err == nil {
		hadVault = true
		tmp := to + ".moving"
		os.Remove(tmp)
		if err := copyFile(from, tmp); err != nil {
			os.Remove(tmp)
			return fail(req.ID, codeIO, "copying the vault failed: "+err.Error())
		}
		if got, err := fileHash(tmp); err != nil || got != want {
			os.Remove(tmp)
			return fail(req.ID, codeIO, "the copy of the vault did not match the original, so nothing was moved")
		}
		if err := os.Rename(tmp, to); err != nil {
			os.Remove(tmp)
			return fail(req.ID, codeIO, err.Error())
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		return fail(req.ID, codeIO, err.Error())
	}

	s.cfg.VaultPath = to
	if err := s.saveConfig(); err != nil {
		s.cfg.VaultPath = from
		if hadVault {
			os.Remove(to)
		}
		return fail(req.ID, codeIO, err.Error())
	}

	// The vault is in its new place. What is left behind is tidied up on a best effort basis.
	if hadVault {
		os.Remove(from)
	}
	newBase := s.vaultBase()
	if err := os.MkdirAll(s.backupDir(), 0o700); err == nil {
		for _, b := range oldBackups {
			src := filepath.Join(oldDir, b.Name)
			dst := filepath.Join(s.backupDir(), newBase+strings.TrimPrefix(b.Name, oldBase))
			if copyFile(src, dst) == nil {
				os.Remove(src)
			}
		}
	}
	os.Remove(oldDir) // only succeeds when it is empty
	return &response{ID: req.ID, OK: true, VaultPath: to, BackupCount: &s.cfg.BackupCount}
}
