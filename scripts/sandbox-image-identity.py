#!/usr/bin/env python3
"""Compare image content across classic Docker and containerd image stores.

Docker .Id can identify a config, manifest or index depending on the store.
RootFS diff IDs and runtime configuration describe the image actually executed.
Transport integrity is checked separately by setup-python-sandbox.sh.
"""
import json
import sys


def normalize(value):
    if isinstance(value, dict):
        return {key: normalize(item) for key, item in value.items()} if value else None
    if isinstance(value, list):
        return [normalize(item) for item in value] if value else None
    return value if value != {} else None


def identity(inspect):
    if not isinstance(inspect, list) or len(inspect) != 1:
        raise ValueError("Expected exactly one sandbox image")
    image = inspect[0]
    rootfs = image["RootFS"]
    if image["Os"] != "linux" or image["Architecture"] != "amd64":
        raise ValueError("Sandbox image must target linux/amd64")
    if rootfs["Type"] != "layers" or not rootfs.get("Layers"):
        raise ValueError("Sandbox image has no filesystem layers")
    config = image["Config"]
    # Ignore legacy build/container metadata, but compare all executable defaults.
    fields = ("User", "Env", "Entrypoint", "Cmd", "WorkingDir", "Labels",
              "ExposedPorts", "Volumes", "StopSignal", "Healthcheck", "Shell",
              "OnBuild", "ArgsEscaped", "StopTimeout")
    defaults = {"User": "", "WorkingDir": "", "StopSignal": "",
                "ArgsEscaped": False}
    return {"version": 1, "os": image["Os"],
            "architecture": image["Architecture"], "layers": rootfs["Layers"],
            "config": {field: normalize(config.get(field) if config.get(field) is not None else defaults.get(field))
                       for field in fields}}


def main():
    actual = identity(json.load(sys.stdin))
    if len(sys.argv) == 1:
        print(json.dumps(actual, sort_keys=True, separators=(",", ":")))
    else:
        with open(sys.argv[1], encoding="utf-8") as expected_file:
            expected = json.load(expected_file)
        if actual != expected:
            differing = [key for key in actual if actual[key] != expected.get(key)]
            raise ValueError("Loaded sandbox image content does not match CI artifact: "
                             + ", ".join(differing))
        print("Loaded sandbox image layers and runtime configuration match CI artifact")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
