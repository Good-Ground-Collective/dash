# Sourced by bin/image and bin/kamal. Exports each NAME=value line of
# $DASH_INFRA_ENV (default ~/.config/dash/infra.env) whose name matches the
# pattern in $1 and isn't already set. An `export ` prefix and one pair of
# surrounding single or double quotes are stripped. Every matching name, set
# before or not, is appended to the infra_env_names array.
infra_env_names=()
load_infra_env() {
  local pattern=$1 file=${DASH_INFRA_ENV:-$HOME/.config/dash/infra.env} line name value
  [[ -r $file ]] || return 0
  while IFS= read -r line || [[ -n $line ]]; do
    line=${line#export }
    [[ $line == *=* ]] || continue
    name=${line%%=*}
    value=${line#*=}
    [[ $name =~ $pattern ]] || continue
    infra_env_names+=("$name")
    [[ -z ${!name:-} ]] || continue
    if [[ $value =~ ^\"(.*)\"$ || $value =~ ^\'(.*)\'$ ]]; then
      value=${BASH_REMATCH[1]}
    fi
    export "$name=$value"
  done <"$file"
}
