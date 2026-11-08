$script:ProjectBuilder = 'omnicompile-low-disk'
function Invoke-ProjectDocker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "Docker operation failed: $($args[0])." }
}
