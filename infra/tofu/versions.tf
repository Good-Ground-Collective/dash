terraform {
  required_version = ">= 1.10.0"

  required_providers {
    linode = {
      source  = "linode/linode"
      version = "~> 3.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "dash-tfstate"
    key    = "prod/terraform.tfstate"
    region = "us-southeast-1"
    endpoints = {
      s3 = "https://us-southeast-1.linodeobjects.com"
    }
    use_lockfile                = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}

provider "linode" {}

provider "cloudflare" {}
