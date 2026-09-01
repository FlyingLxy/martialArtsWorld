#!/bin/bash
cd "$(dirname "$0")"
NAME=$(scutil --get LocalHostName 2>/dev/null)
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo
echo "  把下面任一个地址发给同一个 WiFi 下的朋友："
echo
echo "    http://$IP:8080"
echo "    http://$NAME.local:8080   （IP 变了这个也不变，更稳）"
echo
pgrep -f "node server.js" >/dev/null && echo "  服务器：在跑" || echo "  服务器：没开——双击「开服.command」"
echo
echo "  连不上的话，多半是对方开着代理（Clash 之类）。"
echo "  让他在代理里打开「绕过局域网」，或把 172.16.0.0/12 加进例外。"
echo
read -p "  按回车关闭"
