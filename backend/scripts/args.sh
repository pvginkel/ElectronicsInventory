mkdir -p $(pwd)/tmp

NAME=electronics-inventory
BACKEND_PORT=5000
TESTING_BACKEND_PORT=$((BACKEND_PORT + 100))
ARGS="
    -p ${BACKEND_PORT}:${BACKEND_PORT}
"
