$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$documentPath = Join-Path $repositoryRoot 'docs\technical-solution.md'

if (-not (Test-Path -LiteralPath $documentPath -PathType Leaf)) {
    throw "Missing technical solution document: $documentPath"
}

$content = Get-Content -Raw -LiteralPath $documentPath
$requiredSections = @(
    '# 个人定制每日营养摄入记录 App 技术方案',
    '## 3 总体架构',
    '## 5 API First 设计',
    '## 6 餐食识别与营养估算',
    '## 7 推荐与安全规则',
    '## 9 安全与隐私',
    '## 11 测试与质量保障',
    '## 14 分阶段实施'
)

foreach ($section in $requiredSections) {
    if (-not $content.Contains($section)) {
        throw "Missing required section: $section"
    }
}

$requiredTerms = @(
    'SwiftUI',
    'OpenAPI 3.1',
    'PostgreSQL',
    'VisionProvider',
    'Idempotency-Key',
    'HealthKit'
)

foreach ($term in $requiredTerms) {
    if (-not $content.Contains($term)) {
        throw "Missing required technical decision: $term"
    }
}

if ($content -match '(?i)(api[_-]?key|secret)\s*[=:]\s*[A-Za-z0-9_-]{12,}') {
    throw 'The document appears to contain a credential-like value.'
}

Write-Output 'Technical solution document validation passed.'
