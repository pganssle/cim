JEKYLL=bundle exec jekyll
SHELL=bash
ANDROID_ASSETS=android-wrapper/app/src/main/assets
CHORDS_DIR=static_files/chords/tone_js_pregenerated

help:
	@echo 'Makefile for Jekyll site'
	@echo ''
	@echo 'Usage:'
	@echo 'make init                    Initialize web app (Jekyll)'
	@echo 'make init-android            Initialize Android app (Jekyll)'
	@echo 'make html                    Generate the web site'
	@echo 'make clean                   Clean up generated site'
	@echo 'make serve                   Run development server'
	@echo ''
	@echo 'Chord generation (developers only):'
	@echo 'make generate-chords-manual  Start chord generation page'
	@echo 'make move-downloaded-chords  Move WAV files from Downloads'
	@echo 'make convert-chords-to-mp3   Convert WAV files to MP3'
	@echo 'make clean-chords            Remove all chord files'
	@echo ''
	@echo 'Android:'
	@echo 'make android-setup           Build Android assets'
	@echo 'make android-clean           Clean up Android assets'

.PHONY: vendor/bundle
vendor/bundle:
	bundle config set --local path 'vendor/bundle'
	bundle install

.PHONY: init
init: vendor/bundle

.PHONY: init-android
init-android: vendor/bundle
	@echo "✓ Android dependencies ready"

.PHONY: html
html: vendor/bundle
	$(JEKYLL) build

.PHONY: serve
serve: vendor/bundle
	$(JEKYLL) serve -w

.PHONY: clean
clean:
	$(JEKYLL) clean

.PHONY: android-clean
android-clean:
	rm -rf $(ANDROID_ASSETS)/*

.PHONY: clean-chords
clean-chords:
	rm -rf $(CHORDS_DIR)/*.mp3 $(CHORDS_DIR)/*.wav

.PHONY: generate-chords-manual
generate-chords-manual:
	@echo "Clearing Jekyll cache..."
	@rm -rf _site .jekyll-cache
	@echo "Opening chord generation page in 3 seconds..."
	@echo "IMPORTANT: Use Cmd+Shift+R (Mac) or Ctrl+Shift+F5 (Windows/Linux) to hard refresh the page"
	@echo "Allow multiple downloads when prompted, then Ctrl+C when done"
	@sleep 3
	@open "http://localhost:4000/scripts/generate_chords_once.html?t=$$(date +%s)" 2>/dev/null || xdg-open "http://localhost:4000/scripts/generate_chords_once.html?t=$$(date +%s)" 2>/dev/null || echo "Open http://localhost:4000/scripts/generate_chords_once.html"
	$(JEKYLL) serve

.PHONY: move-downloaded-chords
move-downloaded-chords:
	@if ls ~/Downloads/*_*_*.wav >/dev/null 2>&1; then \
		count=$$(ls ~/Downloads/*_*_*.wav 2>/dev/null | wc -l); \
		mv ~/Downloads/*_*_*.wav $(CHORDS_DIR)/ && \
		echo "✓ Moved $$count WAV files"; \
	else \
		echo "No chord WAV files found in ~/Downloads/"; \
	fi

.PHONY: convert-chords-to-mp3
convert-chords-to-mp3:
	@if ! command -v ffmpeg >/dev/null 2>&1; then \
		echo "ERROR: ffmpeg not found. Install with: brew install ffmpeg"; \
		exit 1; \
	fi
	@cd $(CHORDS_DIR) && \
	for wav in *.wav; do \
		[ -f "$$wav" ] || continue; \
		ffmpeg -i "$$wav" -acodec libmp3lame -b:a 128k "$${wav%.wav}.mp3" -y -loglevel error && rm "$$wav"; \
	done && \
	echo "✓ Converted to MP3"

.PHONY: android-setup
android-setup:
	make android-clean
	mkdir -p $(ANDROID_ASSETS)
	JEKYLL_ENV=android $(JEKYLL) build --destination $(ANDROID_ASSETS)
