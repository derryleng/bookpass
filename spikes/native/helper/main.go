// BookPass native helper (M0 spike version).
//
// Speaks the browser native messaging protocol on stdin and stdout: a 4 byte
// length in native byte order followed by that many bytes of JSON. Stdout is
// the protocol channel, so all diagnostics go to stderr.
//
// The helper only sees encrypted bytes. This spike accepts paths below one
// root folder. The real helper will accept a single configured .kdbx path.
package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	protocolVersion = 1
	helperVersion   = "0.0.1"
	// Browsers accept at most 1 MiB from a native host, and the limit counts the JSON.
	maxOutbound = 1024 * 1024
	// Sanity cap on what we accept from the browser (browsers allow up to 4 GiB).
	maxInbound = 256 * 1024 * 1024
)

type request struct {
	ID     int    `json:"id"`
	Op     string `json:"op"`
	Path   string `json:"path,omitempty"`
	Offset int64  `json:"offset,omitempty"`
	Length int    `json:"length,omitempty"`
	Data   []byte `json:"data,omitempty"`
	Size   int64  `json:"size,omitempty"`
	SHA256 string `json:"sha256,omitempty"`
	Echo   int    `json:"echo,omitempty"` // ask for a reply of this many bytes (message limit tests)
}

type response struct {
	ID       int    `json:"id"`
	OK       bool   `json:"ok"`
	Error    string `json:"error,omitempty"`
	Protocol int    `json:"protocol,omitempty"`
	Helper   string `json:"helper,omitempty"`
	OS       string `json:"os,omitempty"`
	Arch     string `json:"arch,omitempty"`
	Exists   bool   `json:"exists,omitempty"`
	Size     int64  `json:"size,omitempty"`
	SHA256   string `json:"sha256,omitempty"`
	Data     []byte `json:"data,omitempty"`
	EOF      bool   `json:"eof,omitempty"`
	oversize bool   // spike only: skip the outbound size cap to see what browsers do
}

// root is the only folder the spike may touch.
func root() string {
	if dir := os.Getenv("BOOKPASS_SPIKE_DIR"); dir != "" {
		return dir
	}
	exe, _ := os.Executable()
	return filepath.Dir(exe)
}

func resolve(rel string) (string, error) {
	full := filepath.Join(root(), filepath.FromSlash(rel))
	r, err := filepath.Rel(root(), full)
	if err != nil || r == ".." || strings.HasPrefix(r, ".."+string(filepath.Separator)) {
		return "", errors.New("path outside root")
	}
	return full, nil
}

func readMessage(in *bufio.Reader) (*request, error) {
	var n uint32
	if err := binary.Read(in, binary.NativeEndian, &n); err != nil {
		return nil, err
	}
	if n > maxInbound {
		return nil, fmt.Errorf("message too large: %d", n)
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(in, buf); err != nil {
		return nil, err
	}
	var req request
	if err := json.Unmarshal(buf, &req); err != nil {
		return nil, err
	}
	return &req, nil
}

func writeMessage(out io.Writer, resp *response) error {
	buf, err := json.Marshal(resp)
	if err != nil {
		return err
	}
	if len(buf) > maxOutbound && !resp.oversize {
		// The browser would drop the connection, so answer with a small error instead.
		msg := fmt.Sprintf("reply of %d bytes exceeds the 1 MiB browser limit", len(buf))
		if buf, err = json.Marshal(&response{ID: resp.ID, Error: msg}); err != nil {
			return err
		}
	}
	if err := binary.Write(out, binary.NativeEndian, uint32(len(buf))); err != nil {
		return err
	}
	_, err = out.Write(buf)
	return err
}

// upload holds one in-progress atomic write.
type upload struct {
	tmp  *os.File
	dest string
	hash interface {
		io.Writer
		Sum([]byte) []byte
	}
	size int64
}

var up *upload

func handle(req *request) *response {
	resp := &response{ID: req.ID, OK: true}
	fail := func(err error) *response {
		return &response{ID: req.ID, Error: err.Error()}
	}
	switch req.Op {
	case "hello":
		resp.Protocol, resp.Helper, resp.OS, resp.Arch = protocolVersion, helperVersion, runtime.GOOS, runtime.GOARCH
	case "echo":
		resp.Data = make([]byte, req.Echo)
	case "echoOversize": // spike only
		resp.Data, resp.oversize = make([]byte, req.Echo), true
	case "stat":
		path, err := resolve(req.Path)
		if err != nil {
			return fail(err)
		}
		info, err := os.Stat(path)
		if errors.Is(err, os.ErrNotExist) {
			return resp
		}
		if err != nil {
			return fail(err)
		}
		sum, err := fileHash(path)
		if err != nil {
			return fail(err)
		}
		resp.Exists, resp.Size, resp.SHA256 = true, info.Size(), sum
	case "read":
		path, err := resolve(req.Path)
		if err != nil {
			return fail(err)
		}
		f, err := os.Open(path)
		if err != nil {
			return fail(err)
		}
		defer f.Close()
		buf := make([]byte, req.Length)
		n, err := f.ReadAt(buf, req.Offset)
		if err != nil && !errors.Is(err, io.EOF) {
			return fail(err)
		}
		resp.Data, resp.EOF = buf[:n], errors.Is(err, io.EOF)
	case "writeBegin":
		path, err := resolve(req.Path)
		if err != nil {
			return fail(err)
		}
		if up != nil {
			up.tmp.Close()
			os.Remove(up.tmp.Name())
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			return fail(err)
		}
		tmp, err := os.CreateTemp(filepath.Dir(path), ".bookpass-*.tmp")
		if err != nil {
			return fail(err)
		}
		up = &upload{tmp: tmp, dest: path, hash: sha256.New()}
	case "writeChunk":
		if up == nil {
			return fail(errors.New("no write in progress"))
		}
		if _, err := up.tmp.Write(req.Data); err != nil {
			return fail(err)
		}
		up.hash.Write(req.Data)
		up.size += int64(len(req.Data))
	case "writeCommit":
		if up == nil {
			return fail(errors.New("no write in progress"))
		}
		u := up
		up = nil
		got := hex.EncodeToString(u.hash.Sum(nil))
		if got != req.SHA256 || u.size != req.Size {
			u.tmp.Close()
			os.Remove(u.tmp.Name())
			return fail(fmt.Errorf("checksum mismatch: got %s (%d bytes)", got, u.size))
		}
		// Flush to disk, then swap in atomically. A crash before the rename leaves the old file intact.
		if err := u.tmp.Sync(); err != nil {
			return fail(err)
		}
		if err := u.tmp.Close(); err != nil {
			return fail(err)
		}
		if err := os.Rename(u.tmp.Name(), u.dest); err != nil {
			return fail(err)
		}
		resp.SHA256, resp.Size = got, u.size
	case "log": // spike only: lets the extension leave a report on disk
		path, err := resolve(req.Path)
		if err != nil {
			return fail(err)
		}
		if err := os.WriteFile(path, req.Data, 0o600); err != nil {
			return fail(err)
		}
	default:
		return fail(fmt.Errorf("unknown op %q", req.Op))
	}
	return resp
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

func main() {
	in := bufio.NewReaderSize(os.Stdin, 1<<20)
	out := bufio.NewWriterSize(os.Stdout, 1<<20)
	for {
		req, err := readMessage(in)
		if err != nil {
			if !errors.Is(err, io.EOF) {
				fmt.Fprintln(os.Stderr, "read:", err)
				os.Exit(1)
			}
			return // the browser closed the port
		}
		if err := writeMessage(out, handle(req)); err != nil {
			fmt.Fprintln(os.Stderr, "write:", err)
			os.Exit(1)
		}
		if err := out.Flush(); err != nil {
			os.Exit(1)
		}
	}
}
