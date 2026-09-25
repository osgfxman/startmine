Get-ChildItem "public\js\*.js", "public\css\*.css" | ForEach-Object {
    $lines = (Get-Content $_.FullName).Count
    Write-Host ("{0}: {1} lines" -f $_.Name, $lines)
}
