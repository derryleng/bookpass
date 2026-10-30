package main

import (
	"errors"
	"strings"
	"testing"
)

// memoryKeys is a secret store that lives in the test.
type memoryKeys struct {
	secret string
	err    error
}

func (m *memoryKeys) Set(s string) error   { m.secret = s; return m.err }
func (m *memoryKeys) Get() (string, error) { return m.secret, m.err }
func (m *memoryKeys) Clear() error         { m.secret = ""; return m.err }

func TestTheUnlockKeyRoundTripsThroughTheKeychain(t *testing.T) {
	store := &memoryKeys{}
	s := &server{keys: store}
	// The key can be a JSON object, so quotes and braces must survive.
	key := `{"p":"c2VjcmV0","k":"a2V5ZmlsZQ=="}`
	if r := s.handle(&request{ID: 1, Op: "keySet", Key: key}); !r.OK {
		t.Fatalf("keySet: %+v", r)
	}
	if strings.ContainsAny(store.secret, `"{} `) {
		t.Fatalf("the store was handed raw text: %q", store.secret)
	}
	if r := s.handle(&request{ID: 2, Op: "keyGet"}); !r.OK || r.Key != key {
		t.Fatalf("keyGet: %+v", r)
	}
	if r := s.handle(&request{ID: 3, Op: "keyClear"}); !r.OK {
		t.Fatalf("keyClear: %+v", r)
	}
	if r := s.handle(&request{ID: 4, Op: "keyGet"}); !r.OK || r.Key != "" {
		t.Fatalf("keyGet after clear: %+v", r)
	}
}

func TestTheKeyIsNotPartOfAnyReplyButKeyGet(t *testing.T) {
	s := &server{keys: &memoryKeys{}}
	s.handle(&request{ID: 1, Op: "keySet", Key: "abc"})
	for _, op := range []string{"hello", "keySet", "keyClear"} {
		if r := s.handle(&request{ID: 2, Op: op, Key: "abc"}); r.Key != "" {
			t.Errorf("%s replied with the key", op)
		}
	}
}

func TestKeySetRefusesAnEmptyOrHugeKey(t *testing.T) {
	s := &server{keys: &memoryKeys{}}
	for _, key := range []string{"", strings.Repeat("x", maxKeyLength+1)} {
		if r := s.handle(&request{ID: 1, Op: "keySet", Key: key}); r.OK || r.Code != codeInvalid {
			t.Errorf("a key of %d characters was accepted: %+v", len(key), r)
		}
	}
}

func TestAMissingKeychainIsReportedAsUnavailable(t *testing.T) {
	s := &server{keys: &memoryKeys{err: errNoKeychain}}
	for _, req := range []*request{{Op: "keySet", Key: "abc"}, {Op: "keyGet"}, {Op: "keyClear"}} {
		if r := s.handle(req); r.OK || r.Code != codeUnavailable {
			t.Errorf("%s: %+v", req.Op, r)
		}
	}
	other := &server{keys: &memoryKeys{err: errors.New("disk on fire")}}
	if r := other.handle(&request{Op: "keyGet"}); r.OK || r.Code != codeIO {
		t.Errorf("another failure: %+v", r)
	}
}

func TestAnEntryThatIsNotOursIsIgnored(t *testing.T) {
	s := &server{keys: &memoryKeys{secret: "not base64 !!"}}
	if r := s.handle(&request{Op: "keyGet"}); !r.OK || r.Key != "" {
		t.Fatalf("%+v", r)
	}
}
