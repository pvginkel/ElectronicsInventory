# Prometheus Metrics Implementation Plan

## Description
Add a Prometheus scraping endpoint to the Flask backend that exposes metrics relevant to the electronics inventory application, including inventory statistics, storage utilization, activity tracking, and system performance metrics.

## Files and Functions to Create/Modify

### New Files to Create

1. **`app/services/metrics_service.py`**
   - `MetricsService` class inheriting from `BaseService`
   - `initialize_metrics()` - Define Prometheus metric objects
   - `update_inventory_metrics()` - Update inventory-related gauges
   - `update_storage_metrics()` - Update box utilization metrics
   - `update_activity_metrics()` - Update activity counters
   - `record_quantity_change()` - Record quantity change events
   - `record_task_execution()` - Record task duration and status
   - `record_ai_analysis()` - Record comprehensive AI analysis metrics with labels

2. **`app/api/metrics.py`**
   - Flask blueprint for `/metrics` endpoint
   - `get_metrics()` - Return metrics in Prometheus text format

3. **`tests/test_metrics_service.py`**
   - Test metric initialization
   - Test metric updates
   - Test metric value accuracy

4. **`tests/test_metrics_api.py`**
   - Test `/metrics` endpoint availability
   - Test Prometheus format compliance
   - Test metric values in response

### Files to Modify

1. **`pyproject.toml`**
   - Add `prometheus-flask-exporter = "^0.23.0"` to dependencies

2. **`app/__init__.py`**
   - Import and initialize `PrometheusMetrics`
   - Register metrics blueprint
   - Start background metric updater thread

3. **`app/services/container.py`**
   - Add `metrics_service` as Singleton provider
   - Wire to metrics API module

4. **`app/config.py`**
   - Add `METRICS_ENABLED: bool = Field(default=True)`
   - Add `METRICS_UPDATE_INTERVAL: int = Field(default=60)`

5. **`app/services/inventory_service.py`**
   - Modify `add_stock()` to call `metrics_service.record_quantity_change("add", delta)`
   - Modify `use_stock()` to call `metrics_service.record_quantity_change("remove", delta)`

6. **`app/services/document_service.py`**
   - Modify `add_attachment()` to update document metrics
   - Modify `delete_attachment()` to update document metrics

7. **`app/services/task_service.py`**
   - Modify `execute_task()` to record task metrics with duration and status

8. **`app/utils/ai/ai_runner.py`**
   - Modify `AIRunner.run()` method to record comprehensive AI metrics
   - Hook into AIResponse object to extract token counts and cost data
   - Record metrics with full request context (model, verbosity, reasoning_effort)

9. **`app/api/__init__.py`**
   - Import and register metrics blueprint

## Implementation Algorithm

### Metric Collection Process

1. **Initialization Phase**
   - Create Prometheus metric objects using `prometheus_client`:
     - Gauges for current state metrics (parts count, quantities, utilization)
     - Counters for cumulative metrics (total changes, task executions)
     - Histograms for duration metrics (task processing times)

2. **Background Update Loop**
   - Every `METRICS_UPDATE_INTERVAL` seconds:
     - Query database using `DashboardService.get_dashboard_stats()`
     - Update gauge metrics with current values
     - Query box utilization using `DashboardService.get_storage_summary()`
     - Update per-box utilization metrics with labels

3. **Event-Driven Updates**
   - On quantity changes: Increment counter with operation type label
   - On task execution: Record duration in histogram, increment status counter
   - On document operations: Update document count gauge
   - On AI analysis completion: Record comprehensive metrics including token usage, cost, function calls, and web searches with full context labels

4. **Metric Exposure**
   - `/metrics` endpoint generates text output using `prometheus_client.generate_latest()`
   - No authentication required (standard Prometheus practice)
   - Content-Type: text/plain; version=0.0.4

### Metric Definitions

**Inventory Metrics:**
- `inventory_total_parts` (Gauge) - Total parts in system
- `inventory_total_quantity` (Gauge) - Sum of all quantities
- `inventory_low_stock_parts` (Gauge) - Parts with qty ≤ 5
- `inventory_parts_without_docs` (Gauge) - Undocumented parts

**Storage Metrics:**
- `inventory_box_utilization_percent` (Gauge, labels=[box_no]) - Box usage percentage
- `inventory_total_boxes` (Gauge) - Active storage boxes

**Activity Metrics:**
- `inventory_quantity_changes_total` (Counter, labels=[operation]) - Total changes by type
- `inventory_recent_changes_7d` (Gauge) - Changes in last 7 days
- `inventory_recent_changes_30d` (Gauge) - Changes in last 30 days

**Category Metrics:**
- `inventory_parts_by_type` (Gauge, labels=[type_name]) - Parts per category

**AI Analysis Metrics:**
- `ai_analysis_requests_total` (Counter, labels=[status, model, verbosity, reasoning_effort]) - Total AI analysis requests
- `ai_analysis_duration_seconds` (Histogram, labels=[model, verbosity, reasoning_effort]) - AI analysis request duration
- `ai_analysis_tokens_total` (Counter, labels=[type, model, verbosity, reasoning_effort]) - Total tokens used (input/output/reasoning/cached_input)
- `ai_analysis_cost_dollars_total` (Counter, labels=[model, verbosity, reasoning_effort]) - Total cost of AI analysis in dollars
- `ai_analysis_function_calls_total` (Counter, labels=[function_name, model]) - Total function calls made during analysis
- `ai_analysis_web_searches_total` (Counter, labels=[model]) - Total web searches performed during analysis

**System Metrics (auto-collected by prometheus-flask-exporter):**
- `flask_http_request_duration_seconds` (Histogram)
- `flask_http_request_total` (Counter)
- `flask_http_request_exceptions_total` (Counter)