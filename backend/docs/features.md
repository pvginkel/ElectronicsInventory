# Backend Features Checklist

## Core Data Management
- [x] Generate unique 4-letter part IDs (A-Z format)
- [x] Store parts with manufacturer codes, types, descriptions, quantities
- [x] Manage numbered boxes with configurable capacity
- [x] Track numbered locations within boxes (BOX-LOCATION format)
- [x] Handle part-location assignments with quantities
- [x] Auto-clear location assignments when total quantity reaches zero
- [x] Maintain part records even when quantity is zero

## Inventory Operations
- [x] Add new parts to inventory
- [x] Receive items for existing parts
- [x] Use/remove items from specific locations
- [x] Move items between locations
- [x] Split quantities across multiple locations
- [x] Track quantity change history with timestamps

## Search & Discovery
- [ ] Implement PostgreSQL pg_trgm search across all text fields
- [ ] Search parts by ID, manufacturer code, type, tags, description, seller
- [ ] Search document filenames
- [ ] Return search results with quantities and locations

## Document Management
- [ ] Store PDFs in S3 (inventory-docs bucket)
- [ ] Store images in S3 (inventory-images bucket)
- [ ] Handle document uploads through backend API
- [ ] Link multiple documents per part
- [ ] Store document metadata and original filenames

## Shopping List
- [ ] Create shopping list items for parts not yet in inventory
- [ ] Link shopping list items to existing parts when applicable
- [ ] Convert shopping list items to inventory with location suggestions

## Projects/Kits
- [ ] Create projects with required parts and quantities
- [ ] Calculate stock coverage (enough/partial/missing)
- [ ] Deduct quantities from chosen locations during build
- [ ] Add missing project items to shopping list

## Location Intelligence
- [ ] Suggest locations for new parts (prefer same-category boxes)
- [ ] Suggest locations for existing parts (fill gaps in category boxes)
- [ ] Identify first available location when no category preference exists

## Reorganization
- [ ] Generate reorganization plans via Celery background jobs
- [ ] Analyze current layout for optimization opportunities
- [ ] Suggest moves to cluster categories and reduce spread
- [ ] Propose step-by-step move lists with quantities and locations

## AI Integration (Celery Jobs)
- [ ] Auto-tag parts from descriptions and manufacturer codes
- [ ] Suggest categories from part information
- [ ] Extract part numbers from uploaded photos
- [ ] Discover and fetch datasheets based on part numbers
- [ ] Store fetched datasheets in S3

## API Infrastructure
- [x] Implement Flask blueprints for all resource endpoints
- [x] Use Pydantic v2 models for request/response validation
- [x] Generate OpenAPI documentation with Spectree
- [x] Handle centralized error responses with structured JSON
- [x] Manage database sessions per request

## Background Job Processing
- [ ] Configure Celery with RabbitMQ broker
- [ ] Set up PostgreSQL result backend for Celery
- [ ] Implement job retry logic for failed AI operations
- [ ] Handle asynchronous datasheet fetching and storage