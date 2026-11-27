package standards

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// decoders maps each fixtures/<kind>.v<major> directory to the generated type
// that reads it. A schema without an entry here fails TestEverySchemaHasFixtures.
var decoders = map[string]func([]byte) (any, error){
	"example.ping.v1": decode[ExamplePingV1],
}

func decode[T any](data []byte) (any, error) {
	var message T
	err := json.Unmarshal(data, &message)

	return message, err
}

func TestEverySchemaHasFixtures(t *testing.T) {
	schemas, err := filepath.Glob(filepath.Join("..", "schemas", "*.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(schemas) == 0 {
		t.Fatal("no schemas found in ../schemas")
	}

	for _, schema := range schemas {
		name := strings.TrimSuffix(filepath.Base(schema), ".json")
		if _, ok := decoders[name]; !ok {
			t.Errorf("%s has no decoder in fixtures_test.go", name)
		}
		valid, _ := filepath.Glob(filepath.Join("..", "fixtures", name, "valid", "*.json"))
		if len(valid) == 0 {
			t.Errorf("%s has no fixtures in ../fixtures/%s/valid", name, name)
		}
	}
}

func TestFixtures(t *testing.T) {
	directories, err := os.ReadDir(filepath.Join("..", "fixtures"))
	if err != nil {
		t.Fatal(err)
	}

	for _, directory := range directories {
		name := directory.Name()
		decoder, ok := decoders[name]
		if !ok {
			t.Errorf("../fixtures/%s has no decoder in fixtures_test.go", name)
			continue
		}

		for _, file := range fixtureFiles(t, name, "valid") {
			t.Run(name+"/valid/"+filepath.Base(file), func(t *testing.T) {
				data := readFile(t, file)
				message, err := decoder(data)
				if err != nil {
					t.Fatalf("rejected a valid message: %v", err)
				}
				assertKnownFieldsKept(t, data, message)
			})
		}

		for _, file := range fixtureFiles(t, name, "invalid") {
			t.Run(name+"/invalid/"+filepath.Base(file), func(t *testing.T) {
				if _, err := decoder(readFile(t, file)); err == nil {
					t.Fatal("accepted an invalid message")
				}
			})
		}
	}
}

// assertKnownFieldsKept checks that re-encoding the decoded message yields a
// subset of the original: known fields keep their values and unknown fields
// are dropped, as the Zod schemas do.
func assertKnownFieldsKept(t *testing.T, original []byte, message any) {
	t.Helper()

	encoded, err := json.Marshal(message)
	if err != nil {
		t.Fatal(err)
	}

	var want, got any
	if err := json.Unmarshal(original, &want); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatal(err)
	}
	if !isSubset(got, want) {
		t.Fatalf("re-encoded message %s is not a subset of the fixture %s", encoded, original)
	}
}

func isSubset(got, want any) bool {
	gotObject, gotIsObject := got.(map[string]any)
	wantObject, wantIsObject := want.(map[string]any)
	if !gotIsObject || !wantIsObject {
		return reflect.DeepEqual(got, want)
	}

	for key, value := range gotObject {
		wantValue, ok := wantObject[key]
		if !ok || !isSubset(value, wantValue) {
			return false
		}
	}

	return true
}

func fixtureFiles(t *testing.T, name, validity string) []string {
	t.Helper()

	files, err := filepath.Glob(filepath.Join("..", "fixtures", name, validity, "*.json"))
	if err != nil {
		t.Fatal(err)
	}

	return files
}

func readFile(t *testing.T, path string) []byte {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	return data
}
