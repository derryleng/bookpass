package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const defaultBackupCount = 5

// config is the helper's own settings file. It is the only place the vault path lives.
type config struct {
	VaultPath   string `json:"vaultPath"`
	BackupCount int    `json:"backupCount"`
}

// upload is one in-progress atomic write.
type upload struct {
	tmp  *os.File
	hash interface {
		io.Writer
		Sum([]byte) []byte
	}
	size int64
}

type server struct {
	configPath  string
	defaultPath string
	cfg         config
	up          *upload
}

// newServer loads the config. BOOKPASS_CONFIG_DIR and BOOKPASS_DEFAULT_VAULT exist for tests.
func newServer() (*server, error) {
	dir := os.Getenv("BOOKPASS_CONFIG_DIR")
	if dir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return nil, err
		}
		dir = filepath.Join(base, "BookPass")
	}
	def := os.Getenv("BOOKPASS_DEFAULT_VAULT")
	if def == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}
		def = filepath.Join(home, ".bookpass", "bookmarks.kdbx")
	}
	s := &server{configPath: filepath.Join(dir, "config.json"), defaultPath: def, cfg: config{VaultPath: def, BackupCount: defaultBackupCount}}
	data, err := os.ReadFile(s.configPath)
	if errors.Is(err, fs.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &s.cfg); err != nil {
		return nil, fmt.Errorf("config.json: %w", err)
	}
	if s.cfg.VaultPath == "" {
		s.cfg.VaultPath = def
	}
	return s, nil
}

func (s *server) saveConfig() error {
	if err := os.MkdirAll(filepath.Dir(s.configPath), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s.cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.configPath, data, 0o600)
}

func (s *server) handle(req *request) *response {
	ok := &response{ID: req.ID, OK: true}
	switch req.Op {
	case "hello":
		return s.hello(req)
	case "getConfig":
		ok.VaultPath, ok.DefaultPath, ok.BackupCount = s.cfg.VaultPath, s.defaultPath, &s.cfg.BackupCount
	case "setConfig":
		return s.setConfig(req)
	case "pickFolder":
		return s.pickFolder(req)
	case "checkPath":
		return s.checkPath(req)
	case "moveVault":
		return s.moveVault(req)
	case "exists":
		return s.exists(req)
	case "stat":
		return s.stat(req)
	case "findConflicts":
		return &response{ID: req.ID, OK: true, Names: s.conflictCopies()}
	case "archiveConflict":
		return s.archiveConflict(req)
	case "listBackups":
		return s.listBackups(req)
	case "read":
		return s.read(req)
	case "writeBegin":
		return s.writeBegin(req)
	case "writeChunk":
		return s.writeChunk(req)
	case "writeCommit":
		return s.writeCommit(req)
	default:
		return fail(req.ID, codeInvalid, fmt.Sprintf("unknown op %q", req.Op))
	}
	return ok
}

func (s *server) setConfig(req *request) *response {
	if req.VaultPath != "" {
		p, err := expandPath(req.VaultPath)
		if err != nil {
			return fail(req.ID, codeInvalid, err.Error())
		}
		if !strings.EqualFold(filepath.Ext(p), ".kdbx") {
			return fail(req.ID, codeInvalid, "the vault file must end in .kdbx")
		}
		if info, err := os.Stat(p); err == nil && info.IsDir() {
			return fail(req.ID, codeInvalid, "that path is a folder")
		}
		s.cfg.VaultPath = p
	}
	if req.BackupCount != nil {
		if *req.BackupCount < 0 || *req.BackupCount > 100 {
			return fail(req.ID, codeInvalid, "backupCount must be 0 to 100")
		}
		s.cfg.BackupCount = *req.BackupCount
	}
	if err := s.saveConfig(); err != nil {
		return fail(req.ID, codeIO, err.Error())
	}
	return &response{ID: req.ID, OK: true, VaultPath: s.cfg.VaultPath, BackupCount: &s.cfg.BackupCount}
}

// expandPath accepts a leading ~ and requires an absolute path.
func expandPath(p string) (string, error) {
	p = strings.TrimSpace(p)
	if p == "~" || strings.HasPrefix(p, "~/") || strings.HasPrefix(p, `~\`) {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		p = filepath.Join(home, p[1:])
	}
	if !filepath.IsAbs(p) {
		return "", errors.New("the vault path must be absolute")
	}
	return filepath.Clean(p), nil
}

// exists is a cheap check that does not hash the file, for status polling.
func (s *server) exists(req *request) *response {
	info, err := os.Stat(s.cfg.VaultPath)
	if errors.Is(err, fs.ErrNotExist) {
		return &response{ID: req.ID, OK: true}
	}
	if err != nil {
		return fail(req.ID, codeIO, err.Error())
	}
	return &response{ID: req.ID, OK: true, Exists: true, Size: info.Size()}
}

func (s *server) stat(req *request) *response {
	path, err := s.sourcePath(req)
	if err != nil {
		return fail(req.ID, codeInvalid, err.Error())
	}
	info, err := os.Stat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return &response{ID: req.ID, OK: true}
	}
	if err != nil {
		return fail(req.ID, codeIO, err.Error())
	}
	sum, err := fileHash(path)
	if err != nil {
		return fail(req.ID, codeIO, err.Error())
	}
	return &response{ID: req.ID, OK: true, Exists: true, Size: info.Size(), SHA256: sum}
}

func (s *server) read(req *request) *response {
	if req.Length <= 0 || req.Length > maxChunk {
		return fail(req.ID, codeInvalid, fmt.Sprintf("length must be 1 to %d", maxChunk))
	}
	path, err := s.sourcePath(req)
	if err != nil {
		return fail(req.ID, codeInvalid, err.Error())
	}
	f, err := os.Open(path)
	if err != nil {
		return fail(req.ID, codeIO, err.Error())
	}
	defer f.Close()
	buf := make([]byte, req.Length)
	n, err := f.ReadAt(buf, req.Offset)
	if err != nil && !errors.Is(err, io.EOF) {
		return fail(req.ID, codeIO, err.Error())
	}
	return &response{ID: req.ID, OK: true, Data: buf[:n], EOF: errors.Is(err, io.EOF)}
}

func (s *server) discardUpload() {
	if s.up != nil {
		s.up.tmp.Close()
		os.Remove(s.up.tmp.Name())
		s.up = nil
	}
}

func (s *server) writeBegin(req *request) *response {
	s.discardUpload()
	dir := filepath.Dir(s.cfg.VaultPath)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fail(req.ID, codeIO, err.Error())
	}
	removeStaleTemps(dir)
	tmp, err := os.CreateTemp(dir, ".bookpass-*.tmp")
	if err != nil {
		return fail(req.ID, codeIO, err.Error())
	}
	s.up = &upload{tmp: tmp, hash: sha256.New()}
	return &response{ID: req.ID, OK: true}
}

// removeStaleTemps deletes temporary files that an earlier helper left when it was killed in the middle of a save.
func removeStaleTemps(dir string) {
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		name := e.Name()
		if !strings.HasPrefix(name, ".bookpass-") || !strings.HasSuffix(name, ".tmp") {
			continue
		}
		if info, err := e.Info(); err == nil && time.Since(info.ModTime()) > time.Hour {
			os.Remove(filepath.Join(dir, name))
		}
	}
}

func (s *server) writeChunk(req *request) *response {
	if s.up == nil {
		return fail(req.ID, codeInvalid, "no write in progress")
	}
	if _, err := s.up.tmp.Write(req.Data); err != nil {
		s.discardUpload()
		return fail(req.ID, codeIO, err.Error())
	}
	s.up.hash.Write(req.Data)
	s.up.size += int64(len(req.Data))
	return &response{ID: req.ID, OK: true}
}

func (s *server) writeCommit(req *request) *response {
	if s.up == nil {
		return fail(req.ID, codeInvalid, "no write in progress")
	}
	u := s.up
	s.up = nil
	discard := func() {
		u.tmp.Close()
		os.Remove(u.tmp.Name())
	}
	got := hex.EncodeToString(u.hash.Sum(nil))
	if got != req.SHA256 || u.size != req.Size {
		discard()
		return fail(req.ID, codeInvalid, fmt.Sprintf("checksum mismatch: received %d bytes with hash %s", u.size, got))
	}
	// Refuse to overwrite a file that changed since the extension last read it.
	current, err := fileHash(s.cfg.VaultPath)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		current = ""
	case err != nil:
		discard()
		return fail(req.ID, codeIO, err.Error())
	}
	if current != req.ExpectedSHA {
		discard()
		return fail(req.ID, codeConflict, "the vault file changed since BookPass last read it")
	}
	// Flush to disk, back up the old file, then swap in atomically. A crash before the rename leaves the old file intact.
	if err := u.tmp.Sync(); err != nil {
		discard()
		return fail(req.ID, codeIO, err.Error())
	}
	if err := u.tmp.Close(); err != nil {
		os.Remove(u.tmp.Name())
		return fail(req.ID, codeIO, err.Error())
	}
	if current != "" {
		if err := s.backup(); err != nil {
			os.Remove(u.tmp.Name())
			return fail(req.ID, codeIO, "backup failed: "+err.Error())
		}
	}
	if err := os.Rename(u.tmp.Name(), s.cfg.VaultPath); err != nil {
		os.Remove(u.tmp.Name())
		return fail(req.ID, codeIO, err.Error())
	}
	return &response{ID: req.ID, OK: true, SHA256: got, Size: u.size}
}

// backup copies the current vault into a backups folder next to it and prunes the oldest copies.
func (s *server) backup() error {
	if s.cfg.BackupCount == 0 {
		return nil
	}
	dir := filepath.Join(filepath.Dir(s.cfg.VaultPath), "backups")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	base := strings.TrimSuffix(filepath.Base(s.cfg.VaultPath), filepath.Ext(s.cfg.VaultPath))
	// The name is the time to the microsecond, so backups sort oldest first. A fast disk can finish two saves in
	// the same microsecond, so a name that is taken moves on to the next one.
	now := time.Now().UTC()
	for {
		name := fmt.Sprintf("%s-%s.kdbx", base, now.Format("20060102-150405.000000"))
		err := copyFile(s.cfg.VaultPath, filepath.Join(dir, name))
		if errors.Is(err, fs.ErrExist) {
			now = now.Add(time.Microsecond)
			continue
		}
		if err != nil {
			return err
		}
		break
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var mine []string
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), base+"-") && strings.HasSuffix(e.Name(), ".kdbx") {
			mine = append(mine, e.Name())
		}
	}
	sort.Strings(mine) // timestamps sort oldest first
	for len(mine) > s.cfg.BackupCount {
		os.Remove(filepath.Join(dir, mine[0]))
		mine = mine[1:]
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func fileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// sourcePath picks the file a stat or read is about. Apart from the vault itself, only two kinds of file
// can be named, and only by a plain file name that the helper itself found: a copy a sync tool left next to
// the vault, or one of the helper's own backups.
func (s *server) sourcePath(req *request) (string, error) {
	switch req.Source {
	case "", "vault":
		return s.cfg.VaultPath, nil
	case "conflict":
		for _, name := range s.conflictCopies() {
			if name == req.Name {
				return filepath.Join(filepath.Dir(s.cfg.VaultPath), name), nil
			}
		}
		return "", errors.New("that is not a conflict copy of the vault")
	case "backup":
		for _, b := range s.backupList() {
			if b.Name == req.Name {
				return filepath.Join(s.backupDir(), b.Name), nil
			}
		}
		return "", errors.New("that is not a backup of the vault")
	}
	return "", fmt.Errorf("unknown source %q", req.Source)
}

func (s *server) backupDir() string {
	return filepath.Join(filepath.Dir(s.cfg.VaultPath), "backups")
}

// vaultBase is the vault's file name without .kdbx.
func (s *server) vaultBase() string {
	return strings.TrimSuffix(filepath.Base(s.cfg.VaultPath), filepath.Ext(s.cfg.VaultPath))
}

// Marks that sync tools put in the name of a copy they could not merge: Syncthing, Dropbox and Nextcloud.
var conflictMarks = []string{".sync-conflict-", " (conflicted copy", "_conflict-"}

func isConflictCopy(name, base string) bool {
	if !strings.HasPrefix(name, base) || !strings.EqualFold(filepath.Ext(name), ".kdbx") || name == base+".kdbx" {
		return false
	}
	for _, mark := range conflictMarks {
		if strings.Contains(name, mark) {
			return true
		}
	}
	return false
}

func (s *server) conflictCopies() []string {
	entries, err := os.ReadDir(filepath.Dir(s.cfg.VaultPath))
	if err != nil {
		return nil
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && isConflictCopy(e.Name(), s.vaultBase()) {
			names = append(names, e.Name())
		}
	}
	return names
}

// archiveConflict moves a conflict copy into the backups folder once it has been merged, so it is not offered again.
func (s *server) archiveConflict(req *request) *response {
	path, err := s.sourcePath(&request{Source: "conflict", Name: req.Name})
	if err != nil {
		return fail(req.ID, codeInvalid, err.Error())
	}
	if err := os.MkdirAll(s.backupDir(), 0o700); err != nil {
		return fail(req.ID, codeIO, err.Error())
	}
	dest := filepath.Join(s.backupDir(), "merged-"+filepath.Base(path))
	if err := os.Rename(path, dest); err != nil {
		return fail(req.ID, codeIO, err.Error())
	}
	return &response{ID: req.ID, OK: true}
}

type backupInfo struct {
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	Modified int64  `json:"modified"` // milliseconds since 1970
}

// backupList returns the helper's own backups, newest first.
func (s *server) backupList() []backupInfo {
	entries, err := os.ReadDir(s.backupDir())
	if err != nil {
		return nil
	}
	var list []backupInfo
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasPrefix(name, s.vaultBase()+"-") || !strings.HasSuffix(name, ".kdbx") {
			continue
		}
		if info, err := e.Info(); err == nil {
			list = append(list, backupInfo{Name: name, Size: info.Size(), Modified: info.ModTime().UnixMilli()})
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Name > list[j].Name })
	return list
}

func (s *server) listBackups(req *request) *response {
	return &response{ID: req.ID, OK: true, Backups: s.backupList()}
}
