// BookPass native helper.
//
// Speaks the browser native messaging protocol on stdin and stdout: a 4 byte
// length in native byte order followed by that many bytes of JSON. Stdout is
// the protocol channel, so all diagnostics go to stderr.
//
// The helper reads and writes exactly one file, the vault path from its own
// config file. It only ever sees encrypted bytes and never runs commands or
// opens network connections. See docs/PROTOCOL.md for the message list.
package main

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
)

const (
	protocolVersion = 1
	helperVersion   = "0.1.0"
	// Browsers accept at most 1 MiB from a native host, and the limit counts the JSON.
	maxOutbound = 1024 * 1024
	// The most we read for one chunk: base64 of 512 KiB is about 683 KB, which leaves room for the JSON.
	maxChunk = 512 * 1024
	// Sanity cap on what we accept from the browser (browsers allow up to 4 GiB).
	maxInbound = 64 * 1024 * 1024
)

// Error codes the extension can act on.
const (
	codeConflict = "conflict" // the file changed since it was last read
	codeInvalid  = "invalid"  // the request is wrong
	codeIO       = "io"       // the disk said no
)

type request struct {
	ID          int    `json:"id"`
	Op          string `json:"op"`
	Offset      int64  `json:"offset,omitempty"`
	Length      int    `json:"length,omitempty"`
	Data        []byte `json:"data,omitempty"`
	Size        int64  `json:"size,omitempty"`
	SHA256      string `json:"sha256,omitempty"`
	ExpectedSHA string `json:"expectedSha256,omitempty"` // hash of the file we last read, empty if it did not exist
	VaultPath   string `json:"vaultPath,omitempty"`
	BackupCount *int   `json:"backupCount,omitempty"`
}

type response struct {
	ID          int    `json:"id"`
	OK          bool   `json:"ok"`
	Code        string `json:"code,omitempty"`
	Error       string `json:"error,omitempty"`
	Protocol    int    `json:"protocol,omitempty"`
	Helper      string `json:"helper,omitempty"`
	OS          string `json:"os,omitempty"`
	Arch        string `json:"arch,omitempty"`
	VaultPath   string `json:"vaultPath,omitempty"`
	DefaultPath string `json:"defaultPath,omitempty"`
	BackupCount *int   `json:"backupCount,omitempty"`
	Exists      bool   `json:"exists,omitempty"`
	Size        int64  `json:"size,omitempty"`
	SHA256      string `json:"sha256,omitempty"`
	Data        []byte `json:"data,omitempty"`
	EOF         bool   `json:"eof,omitempty"`
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
	if len(buf) > maxOutbound {
		// The browser would drop the connection, so answer with a small error instead.
		msg := fmt.Sprintf("reply of %d bytes exceeds the 1 MiB browser limit", len(buf))
		if buf, err = json.Marshal(fail(resp.ID, codeInvalid, msg)); err != nil {
			return err
		}
	}
	if err := binary.Write(out, binary.NativeEndian, uint32(len(buf))); err != nil {
		return err
	}
	_, err = out.Write(buf)
	return err
}

func fail(id int, code, msg string) *response {
	return &response{ID: id, Code: code, Error: msg}
}

func main() {
	srv, err := newServer()
	if err != nil {
		fmt.Fprintln(os.Stderr, "startup:", err)
		os.Exit(1)
	}
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
		if err := writeMessage(out, srv.handle(req)); err != nil {
			fmt.Fprintln(os.Stderr, "write:", err)
			os.Exit(1)
		}
		if err := out.Flush(); err != nil {
			os.Exit(1)
		}
	}
}

func (s *server) hello(req *request) *response {
	return &response{ID: req.ID, OK: true, Protocol: protocolVersion, Helper: helperVersion, OS: runtime.GOOS, Arch: runtime.GOARCH}
}
