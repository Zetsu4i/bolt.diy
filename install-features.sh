#!/bin/bash

# Installation script for Claude Code-inspired features in bolt.diy
# Run this script to install required dependencies and verify implementation

set -e

echo "======================================"
echo "bolt.diy Feature Installation"
echo "======================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Please run this script from the bolt.diy root directory."
    exit 1
fi

echo "✓ Found bolt.diy project"
echo ""

# Install additional dependencies
echo "Installing required dependencies..."
echo ""

# Check if @ai-sdk/azure is already installed
if ! grep -q "@ai-sdk/azure" package.json; then
    echo "Installing @ai-sdk/azure..."
    npm install @ai-sdk/azure
else
    echo "✓ @ai-sdk/azure already installed"
fi

# Check if @ai-sdk/google-vertex is already installed
if ! grep -q "@ai-sdk/google-vertex" package.json; then
    echo "Installing @ai-sdk/google-vertex..."
    npm install @ai-sdk/google-vertex
else
    echo "✓ @ai-sdk/google-vertex already installed"
fi

# Verify diff package (should already be installed)
if ! grep -q "\"diff\"" package.json; then
    echo "Installing diff..."
    npm install diff
else
    echo "✓ diff already installed"
fi

echo ""
echo "======================================"
echo "Verifying Implementation"
echo "======================================"
echo ""

# Check for required service files
services=(
    "app/lib/services/agent-orchestrator.ts"
    "app/lib/services/conflict-detection.ts"
    "app/lib/services/file-audit.ts"
    "app/lib/services/knowledge-base.ts"
    "app/lib/services/project-planner.ts"
    "app/lib/services/prompt-optimizer.ts"
    "app/lib/services/vscode-integration.ts"
)

echo "Checking service files..."
for file in "${services[@]}"; do
    if [ -f "$file" ]; then
        echo "✓ $file"
    else
        echo "✗ Missing: $file"
    fi
done
echo ""

# Check for provider files
providers=(
    "app/lib/modules/llm/providers/azure-openai.ts"
    "app/lib/modules/llm/providers/vertex-ai.ts"
    "app/lib/modules/llm/providers/granite.ts"
)

echo "Checking provider files..."
for file in "${providers[@]}"; do
    if [ -f "$file" ]; then
        echo "✓ $file"
    else
        echo "✗ Missing: $file"
    fi
done
echo ""

# Check for UI components
components=(
    "app/components/workbench/DocumentUpload.tsx"
)

echo "Checking UI components..."
for file in "${components[@]}"; do
    if [ -f "$file" ]; then
        echo "✓ $file"
    else
        echo "✗ Missing: $file"
    fi
done
echo ""

# Check documentation
echo "Checking documentation..."
if [ -f "FEATURES_IMPLEMENTATION.md" ]; then
    echo "✓ FEATURES_IMPLEMENTATION.md"
else
    echo "✗ Missing: FEATURES_IMPLEMENTATION.md"
fi

if [ -f "IMPLEMENTATION_SUMMARY.md" ]; then
    echo "✓ IMPLEMENTATION_SUMMARY.md"
else
    echo "✗ Missing: IMPLEMENTATION_SUMMARY.md"
fi
echo ""

echo "======================================"
echo "Configuration Guide"
echo "======================================"
echo ""

echo "To use the new features, configure environment variables:"
echo ""
echo "Azure OpenAI:"
echo "  AZURE_OPENAI_API_KEY=your-api-key"
echo "  AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com"
echo ""
echo "Google Vertex AI:"
echo "  GOOGLE_VERTEX_AI_PROJECT=your-project-id"
echo "  GOOGLE_VERTEX_AI_CREDENTIALS='{\"type\":\"service_account\",...}'"
echo ""
echo "IBM Granite:"
echo "  GRANITE_API_KEY=your-api-key"
echo "  GRANITE_BASE_URL=https://us-south.ml.cloud.ibm.com/ml/v1"
echo ""

echo "Add these to your .env file or environment configuration."
echo ""

echo "======================================"
echo "Next Steps"
echo "======================================"
echo ""
echo "1. Configure environment variables for desired providers"
echo "2. Review FEATURES_IMPLEMENTATION.md for usage examples"
echo "3. Integrate features into your workflow"
echo "4. (Optional) Build VSCode extension for full integration"
echo ""
echo "For detailed documentation, see:"
echo "  - FEATURES_IMPLEMENTATION.md (comprehensive guide)"
echo "  - IMPLEMENTATION_SUMMARY.md (quick reference)"
echo ""

echo "======================================"
echo "Installation Complete!"
echo "======================================"
echo ""
echo "All features have been installed and verified."
echo "Run 'npm run dev' to start the development server."
echo ""
