$API_BASE = "http://localhost:8787"

Write-Host "--- 1. Authenticating as Admin ---" -ForegroundColor Cyan
$loginRes = Invoke-RestMethod -Uri "$API_BASE/api/auth/login" -Method Post -Body (@{username="admin@cloudgreen.test"; password="admin123"; role="admin"} | ConvertTo-Json) -ContentType "application/json"
$token = $loginRes.token
Write-Host "Token obtained: $($token.Substring(0, 15))..."

$csvPath = "c:\Users\Manish\Downloads\cloudgreen-os\tmp\test_emissions.csv"
$csvContent = Get-Content -Path $csvPath -Raw
Write-Host "--- 2. Calculating SHA-256 Hash ---" -ForegroundColor Cyan
$vcHash = (Get-FileHash -Path $csvPath -Algorithm SHA256).Hash.ToLower()
Write-Host "vcHash: $vcHash"

Write-Host "--- 3. Generating ZK-Proof (3001 kgCO2e) ---" -ForegroundColor Cyan
$proofRes = Invoke-RestMethod -Uri "$API_BASE/api/utils/generate-zk-proof" -Method Post -Body (@{emissionKg=3001} | ConvertTo-Json) -ContentType "application/json"
Write-Host "ZK-Proof generated successfully."

Write-Host "--- 4. Submitting Verifiable Ingestion ---" -ForegroundColor Cyan
$payload = @{
    csv = $csvContent
    vcHash = $vcHash
    proof = @{
        proof = $proofRes.proof
        publicSignals = $proofRes.publicSignals
        totalEmissionKg = $proofRes.totalEmissionKg
    }
} | ConvertTo-Json -Depth 10

try {
    $ingestRes = Invoke-RestMethod -Uri "$API_BASE/api/suppliers/emissions/upload" -Method Post -Body $payload -ContentType "application/json" -Headers @{Authorization="Bearer $token"}
    Write-Host "VERIFICATION SUCCESS!" -ForegroundColor Green
    Write-Host "Batch ID: $($ingestRes.batchId)"
    Write-Host "VCs Issued: $($ingestRes.credentials.Count)"
} catch {
    Write-Host "VERIFICATION FAILED:" -ForegroundColor Red
    $_.Exception.Message
    $_.ErrorDetails.Message
    exit 1
}
