#!/bin/bash
# Cross-Platform Deployment Script for Sovereign Task Manager & Multi-Agent System
# This script handles deployment of both applications to various platforms

set -e  # Exit on any error

# Configuration - ADJUST THESE FOR YOUR ENVIRONMENT
DEPLOY_PLATFORM="${DEPLOY_PLATFORM:-github}"  # github, vercel, railway, render, heroku
GITHUB_REPO="${GITHUB_REPO:-your-username/your-repo}"
GITHUB_TOKEN="${GITHUB_TOKEN:-your_github_token}"
VERCEL_TOKEN="${VERCEL_TOKEN:-your_vercel_token}"
RAILWAY_TOKEN="${RAILWAY_TOKEN:-your_railway_token}"
RENDER_API_KEY="${RENDER_API_KEY:-your_render_key}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

warn() {
    echo -e "${YELLOW}[WARN] $1${NC}"
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    # Check if we're in the right directory
    if [[ ! -d "sovereign-task-manager" ]] || [[ ! -d "multi_agent_system" ]]; then
        error "Both sovereign-task-manager and multi_agent_system directories must exist"
        exit 1
    fi

    # Check for required tools based on platform
    case $DEPLOY_PLATFORM in
        github)
            if ! command -v git &> /dev/null; then
                error "Git is required for GitHub deployment"
                exit 1
            fi
            ;;
        vercel)
            if ! command -v vercel &> /dev/null; then
                error "Vercel CLI is required for Vercel deployment"
                exit 1
            fi
            ;;
        railway)
            if ! command -v railway &> /dev/null; then
                error "Railway CLI is required for Railway deployment"
                exit 1
            fi
            ;;
    esac

    log "Prerequisites check passed"
}

# Deploy to GitHub
deploy_github() {
    log "Deploying to GitHub..."

    # Initialize git repo if not already
    if [[ ! -d ".git" ]]; then
        git init
        git add .
        git commit -m "Initial commit: Sovereign Task Manager & Multi-Agent System"
    fi

    # Set remote if not exists
    if ! git remote get-url origin &> /dev/null; then
        git remote add origin "https://github.com/${GITHUB_REPO}.git"
    fi

    # Push to GitHub
    git push -u origin main 2>/dev/null || git push -u origin master

    info "GitHub deployment completed"
    info "Repository: https://github.com/${GITHUB_REPO}"
}

# Deploy Sovereign Task Manager Frontend to Vercel
deploy_frontend_vercel() {
    log "Deploying Sovereign Task Manager Frontend to Vercel..."

    cd sovereign-task-manager/frontend

    # Login to Vercel if needed
    if [[ -n "$VERCEL_TOKEN" ]]; then
        vercel login --token "$VERCEL_TOKEN"
    else
        warn "No Vercel token provided, using interactive login"
        vercel login
    fi

    # Deploy
    vercel --prod --yes

    # Get deployment URL
    FRONTEND_URL=$(vercel --prod 2>/dev/null | grep -o 'https://[^ ]*')

    cd ../..
    info "Frontend deployed to: $FRONTEND_URL"
}

# Deploy Sovereign Task Manager Backend to Railway
deploy_backend_railway() {
    log "Deploying Sovereign Task Manager Backend to Railway..."

    cd sovereign-task-manager/backend

    # Login to Railway if needed
    if [[ -n "$RAILWAY_TOKEN" ]]; then
        railway login --token "$RAILWAY_TOKEN"
    else
        warn "No Railway token provided, using interactive login"
        railway login
    fi

    # Initialize Railway project
    railway init --name "sovereign-task-manager-backend" --yes

    # Set environment variables
    railway variables set NODE_ENV=production
    railway variables set MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017/sovereign-tasks}"
    railway variables set JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 32)}"
    railway variables set FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"

    # Deploy
    railway up

    # Get deployment URL
    BACKEND_URL=$(railway domain 2>/dev/null)

    cd ../..
    info "Backend deployed to: $BACKEND_URL"
}

# Deploy Multi-Agent System to Render
deploy_multiagent_render() {
    log "Deploying Multi-Agent System to Render..."

    cd multi_agent_system

    # Create render.yaml if it doesn't exist
    cat > render.yaml << EOF
services:
  - type: web
    name: multi-agent-system
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: python main.py --demo
    envVars:
      - key: PYTHON_VERSION
        value: 3.9
      - key: LOG_LEVEL
        value: INFO
    autoDeploy: true
EOF

    # Create requirements.txt if missing dependencies
    if [[ ! -f "requirements.txt" ]]; then
        cat > requirements.txt << EOF
pydantic>=2.0.0
python-dotenv>=1.0.0
rich>=13.0.0
aiofiles>=23.0.0
transformers>=4.21.0
torch>=2.0.0
sentence-transformers>=2.2.0
scikit-learn>=1.3.0
numpy>=1.24.0
EOF
    fi

    info "Multi-Agent System prepared for Render deployment"
    info "Upload the multi_agent_system directory to Render manually or use Render CLI"

    cd ..
}

# Main deployment function
main() {
    log "Starting Cross-Platform Deployment"
    log "Platform: $DEPLOY_PLATFORM"
    log "Target: $GITHUB_REPO"

    check_prerequisites

    case $DEPLOY_PLATFORM in
        github)
            deploy_github
            ;;
        vercel)
            deploy_frontend_vercel
            ;;
        railway)
            deploy_backend_railway
            ;;
        render)
            deploy_multiagent_render
            ;;
        all)
            log "Deploying everything..."
            deploy_github
            deploy_frontend_vercel
            deploy_backend_railway
            deploy_multiagent_render
            ;;
        *)
            error "Unknown platform: $DEPLOY_PLATFORM"
            echo "Supported platforms: github, vercel, railway, render, all"
            exit 1
            ;;
    esac

    log "Deployment completed successfully! 🎉"
    echo ""
    info "Next steps:"
    case $DEPLOY_PLATFORM in
        github)
            echo "  - Visit: https://github.com/${GITHUB_REPO}"
            echo "  - Clone: git clone https://github.com/${GITHUB_REPO}.git"
            ;;
        vercel)
            echo "  - Frontend is live on Vercel"
            ;;
        railway)
            echo "  - Backend is live on Railway"
            ;;
        render)
            echo "  - Multi-Agent System ready for Render"
            ;;
    esac
}

# Run main function
main "$@"