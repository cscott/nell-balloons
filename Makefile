all: assets/www/images/nell-body.png assets/www/images/nell-head.png
# Combine nell images into a single sprite.
NELLS=0 1 2 3 4 5 6 7 8 9 10
assets/www/images/nell-body.png: \
	$(foreach n,$(NELLS),art/nell/nell-body$(n).png)
	montage $^ -tile x1 -geometry +0+0 -background none $@
assets/www/images/nell-head.png: \
	$(foreach n,$(NELLS),art/nell/nell-head$(n).png)
	montage $^ -tile x1 -geometry +0+0 -background none $@
