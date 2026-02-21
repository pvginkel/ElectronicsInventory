mkdir -p $(pwd)/tmp

NAME=electronics-inventory
BACKEND_PORT=3001
TESTING_BACKEND_PORT=$((BACKEND_PORT + 10))
ARGS="
    -p ${BACKEND_PORT}:${BACKEND_PORT}
"
