#!/bin/bash

export GIT_REPOSITORY_UTL="$GIT_REPLOSITORY_URL"

gitl clone "$$GIT_REPLOSITORY_URL" /home/app/output

exec node script.js