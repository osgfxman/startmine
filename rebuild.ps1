$lines = Get-Content 'public\index.html'

# Build new index.html
$head = @"
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>Startmine</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-database-compat.js"></script>
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/miro.css">
</head>
"@

# HTML body content: lines 3087-3489 (0-indexed: 3086-3488)
$bodyContent = $lines[3086..3488] -join "`n"

$scripts = @"

    <script src="js/app.js"></script>
    <script src="js/outline.js"></script>
    <script src="js/miro-engine.js"></script>
    <script src="js/thumbnails.js"></script>
    <script src="js/miro-cards.js"></script>
    <script src="js/alignment.js"></script>
</body>

</html>
"@

$newContent = $head + "`n" + $bodyContent + "`n" + $scripts
$newContent | Set-Content 'public\index.html' -Encoding UTF8

Write-Host "New index.html: $((Get-Content 'public\index.html').Count) lines"
Write-Host "Done! index.html has been rebuilt with external CSS/JS references."
