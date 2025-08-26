mkdir -p $(pwd)/tmp

NAME=electronics-inventory
ARGS="
    -e DNSMASQ_CONFIG_FILE_PATH=/data/dnsmasq.conf
    -v $(pwd)/data:/data
    -p 5000:5000
"
