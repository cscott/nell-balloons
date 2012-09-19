ffmpeg -i SpaceBalloon2-1-18M256.mp4 -vcodec libvpx -acodec libvorbis -ar 44100 -b:v 256k -b:a 32k -s 800x450 -r 25 -ac 1 SpaceBalloon2-1-256k32k.webm
mkclean --doctype 4 --remux --optimize SpaceBalloon2-1-256k32k.webm SpaceBalloon2-1-256k32k-clean.webm
totem-video-thumbnailer -j -s 800 -l ~/Kdenlive/SpaceBalloon1-1-12M128k.mp4 Spac
eBalloon1-1.jpg
