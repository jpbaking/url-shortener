#!/bin/sh
set -eu

template="/etc/nginx/url-shortener/nginx.conf.template"

if [ -z "${S_DOMAIN:-}" ]; then
  template="/etc/nginx/url-shortener/nginx.single-domain.conf.template"
  echo "url-shortener: rendering single-domain nginx config for ${SHORT_DOMAIN:-short.url}"
else
  echo "url-shortener: rendering dual-domain nginx config for ${SHORT_DOMAIN:-short.url} and ${S_DOMAIN}"
fi

envsubst '${SHORT_DOMAIN} ${S_DOMAIN}' < "$template" > /etc/nginx/conf.d/default.conf
