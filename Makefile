all: build-all

images: assets/www/images/nell-body.png assets/www/images/nell-head.png

# Combine nell images into a single sprite.
NELLS=0 1 2 3 4 5 6 7 8 9 10
assets/www/images/nell-body.png: \
	$(foreach n,$(NELLS),art/nell/nell-body$(n).png)
	montage $^ -tile x1 -geometry +0+0 -background none $@
assets/www/images/nell-head.png: \
	$(foreach n,$(NELLS),art/nell/nell-head$(n).png)
	montage $^ -tile x1 -geometry +0+0 -background none $@

#OPT=optimize=none
OPT=

build/index.js: assets/www/index.js # and other stuff
	mkdir -p build
	node r.js -o name=index out=$@ baseUrl=assets/www $(OPT)
build-all: build/index.js
	mkdir -p build/images build/sounds build/video
	grep -v cordova assets/www/index.html | \
	  sed -e 's/<html/<html manifest="manifest.appcache" /' \
	  > build/index.html
	for f in install.html manifest.webapp ; do \
	  sed -e 's/@VERSION@/'`./print-version.js`'/g' \
	    < assets/www/$$f > build/$$f ; \
	done
	cp res/drawable-mdpi/ic_launcher.png build/images/icon-48.png
	cp assets/www/appcacheui.js build/
	cp assets/www/require.min.js build/require.js
	cp assets/www/*.css build/
	cp assets/www/images/* build/images
	cp assets/www/sounds/*.webm build/sounds
	cp assets/www/video/*.jpg \
	   assets/www/video/*.webm build/video
	# offline manifest (everything!)
	( echo "CACHE MANIFEST" ; \
	  echo -n '# ' ; find build -type f | fgrep -v manifest | \
	    fgrep -v install.html | sort | xargs md5sum -b | md5sum; echo ; \
	  echo "CACHE:" ; \
	  cd build ; find . -type f -print | fgrep -v manifest | \
	    fgrep -v install.html | sort ) > build/manifest.appcache
	# domain name for github pages
	echo nell-balloons.github.cscott.net > build/CNAME
	# turn off jekyll for github pages
	touch build/.nojekyll
	# apache support for HTML5 offline manifest
	( echo "AddType text/cache-manifest .appcache" ; \
	  echo "AddType application/x-web-app-manifest+json .webapp" ; \
	  echo "AddType video/webm .webm" ; \
	  echo "AddType audio/ogg .ogg" ; \
	  echo "AddType audio/mpeg .mp3" ) \
	  > build/.htaccess


clean:
	$(RM) -rf build
