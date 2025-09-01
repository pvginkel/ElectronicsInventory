#!/bin/sh

# TEST="DFRobot Gravity SGP40-sensor_keywords0"
# TEST="HLK PM24-sensor_keywords1"
TEST="ESP32-S3FN8-sensor_keywords2"

poetry run pytest \
    --no-cov \
    --log-cli-level=info \
    -m integration \
    tests/test_ai_service_real_integration.py::TestAIServiceRealIntegration::test_analyze_real_api["$TEST"]
