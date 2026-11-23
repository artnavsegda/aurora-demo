FRONTEND ?= /Users/artnavsegda/Desktop/aurora/dist

.PHONY: prepare docker

prepare:
	scripts/prepare-frontend.sh "$(FRONTEND)"

docker: prepare
	docker compose up --build
