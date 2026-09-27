# Servidor estatico minimo para ver el modulo en local (sin Python ni Node).
# Uso: powershell -ExecutionPolicy Bypass -File app\servidor.ps1 [-Puerto 8765] [-Raiz <carpeta>]
param([int]$Puerto = 8765, [string]$Raiz = $PSScriptRoot)
$raiz = [IO.Path]::GetFullPath($Raiz)
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8'
           '.css'='text/css; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.ico'='image/x-icon' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Puerto/")
$l.Start()
Write-Host "Sirviendo $raiz en http://localhost:$Puerto/  (Ctrl+C para detener)"
try {
    while ($l.IsListening) {
        $ctx = $l.GetContext()
        $res = $ctx.Response
        try {
            $ruta = [uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
            if (-not $ruta) { $ruta = 'index.html' }
            $archivo = [IO.Path]::GetFullPath((Join-Path $raiz $ruta))
            if ($archivo.StartsWith($raiz) -and (Test-Path -LiteralPath $archivo -PathType Leaf)) {
                $bytes = [IO.File]::ReadAllBytes($archivo)
                $ext = [IO.Path]::GetExtension($archivo).ToLower()
                $res.ContentType = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
                $res.Headers.Add('Cache-Control', 'no-store')
                $res.ContentLength64 = $bytes.Length
                if ($ctx.Request.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
                Write-Host "200 $($ctx.Request.HttpMethod) /$ruta"
            } else {
                $res.StatusCode = 404
                Write-Host "404 /$ruta"
            }
        } catch {
            Write-Host "ERROR /$ruta : $($_.Exception.Message)"
        } finally {
            try { $res.Close() } catch {}
        }
    }
} finally { $l.Stop() }
