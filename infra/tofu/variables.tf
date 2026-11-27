variable "region" {
  description = "Linode region for every box. Atlanta has no VPC support, so boxes talk over Tailscale."
  type        = string
  default     = "us-southeast"
}

variable "image" {
  description = "Linode image for every box."
  type        = string
  default     = "linode/ubuntu24.04"
}

variable "admin_username" {
  description = "Non-root sudo user created by cloud-init on every box."
  type        = string
  default     = "dash"
}

variable "admin_ssh_public_keys" {
  description = "SSH public keys for the admin user."
  type        = list(string)
  default = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDCk5Un2yfWrT83dFFm11CCck5pPOkO1/N0W0wfyMFnc",
  ]
}

variable "deploy_ssh_public_keys" {
  description = "SSH public keys CI deploys with. Added to the admin user on dash-app only, usable only from tailnet addresses."
  type        = list(string)
  default = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILoiulJVE4QQhSMw+GrleIYrYQa9YKi7JnOeV9Jnsh//",
  ]
}

variable "tailscale_auth_key" {
  description = "Pre-authorized Tailscale auth key tagged tag:dash. Only used at first boot; set TF_VAR_tailscale_auth_key."
  type        = string
  sensitive   = true
  nullable    = false

  validation {
    condition     = startswith(var.tailscale_auth_key, "tskey-") && var.tailscale_auth_key != "tskey-auth-REPLACE-ME"
    error_message = "Set TF_VAR_tailscale_auth_key to a real pre-authorized tag:dash key."
  }
}

variable "zone_name" {
  description = "Cloudflare zone that holds the Dash records."
  type        = string
  default     = "doublel.studio"
}
