#!/bin/bash

set -e

PROFILE_D_FILE="/etc/profile.d/github-desktop-plus.sh"
INSTALL_DIR="/usr/lib/github-desktop-plus"
CLI_DIR="$INSTALL_DIR/resources/app/static"
CLI_INSTALL_TARGET="/usr/bin/github-desktop-plus-cli"

case "$1" in
    configure)
      # add executable permissions for CLI interface
      chmod +x "$CLI_DIR"/github || :
      # check if this is a dev install or standard
      if [ -f "$INSTALL_DIR/github-desktop-plus-dev" ]; then
	      BINARY_NAME="github-desktop-plus-dev"
      else
	      BINARY_NAME="github-desktop-plus"
      fi
      # create symbolic links to /usr/bin directory
      ln -f -s "$INSTALL_DIR"/$BINARY_NAME /usr/bin || :
      ln -f -s "$CLI_DIR"/github "$CLI_INSTALL_TARGET" || :
    ;;

    abort-upgrade|abort-remove|abort-deconfigure)
    ;;

    *)
      echo "postinst called with unknown argument \`$1'" >&2
      exit 1
    ;;
esac

exit 0
