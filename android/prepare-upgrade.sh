#!/usr/bin/env bash
set -euo pipefail
for item in legacy:d1cd3f6b5568fcf2c318c18b8bb754216c14a208 published:57462c3669ba79cbc48775b7efe38888de865470 previous:acaf9bc9e2493619bbaddfd01b7d8267b13020a9; do
  label="${item%%:*}"
  revision="${item#*:}"
  git fetch --depth 1 origin "$revision"
  git worktree add --detach "$RUNNER_TEMP/robotics-$label" "$revision"
  ROBOTICS_OUTPUT_DIR="$RUNNER_TEMP/robotics-$label-output" python3 "$RUNNER_TEMP/robotics-$label/android/build.py" --unsigned
  "$ANDROID_SDK_ROOT/build-tools/35.0.0/apksigner" sign --ks "$RUNNER_TEMP/smoke.jks" --ks-pass pass:android --key-pass pass:android --out "$RUNNER_TEMP/robotics-$label.apk" "$RUNNER_TEMP/robotics-$label-output/"*-unsigned.apk
done
node --input-type=module -e "import {circuitProblems} from './circuits-data.js'; console.log(JSON.stringify(circuitProblems.find(p=>p.id==='kvl-02')))" > "$RUNNER_TEMP/circuit-fixture.json"
