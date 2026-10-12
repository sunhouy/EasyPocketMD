# HTTP/3 for the public website

Both domestic and overseas releases terminate HTTPS in the host Nginx. The internal Docker gateway remains HTTP; changing its protocol does not change the browser's connection.

The deployment script detects `--with-http_v3_module` in the public Nginx build. Supported servers enable QUIC on every existing HTTPS/443 address, enable `http3`, advertise `Alt-Svc` on every proxied response, and hide upstream `Alt-Svc`. The standalone `nginx.conf` also enables QUIC and explicitly preserves advertisements in locations with their own cache/CORS headers.

For both public edges:

1. Install Nginx 1.25 or newer built with `--with-http_v3_module` and a supported TLS library; confirm with `nginx -V`.
2. Permit inbound **UDP 443** in the cloud firewall, host firewall, load balancer and NAT. TCP 443 and HTTPS certificates are still required.
3. Run the existing deployment and confirm its `nginx -t` and public HTTPS health checks pass. Unsupported builds are reported explicitly; the script never advertises unavailable QUIC or disrupts the existing site.
4. Verify with a curl build supporting HTTP/3:

   ```sh
   curl --http3-only --output /dev/null --write-out '%{http_version}\n' https://md.yhsun.cn/
   curl --http3-only --output /dev/null --write-out '%{http_version}\n' https://md.yhsun.cn/api/health
   ```

   Test each edge IP using `--resolve md.yhsun.cn:443:EDGE_IP`, and test a real `/assets/` URL. The result must be `3`. Check the browser Network panel's Protocol column after an advertisement has been received.

HTTP/3 negotiation belongs to the browser and TLS edge, not JavaScript `fetch`. Clients without QUIC support, blocked UDP networks and initial discovery can use HTTP/2 or HTTP/1.1. Keep those compatible transports; a frontend cannot guarantee HTTP/3 for every browser request. CDN-fronted deployments also need HTTP/3 enabled at the CDN. Existing WebSocket upgrades retain their compatible transport.

References: https://nginx.org/en/docs/http/ngx_http_v3_module.html and https://www.rfc-editor.org/rfc/rfc9114.html
