locals {
  hosts = {
    app = {
      label    = "dash-app"
      type     = "g6-standard-1"
      firewall = "public"
    }
    db = {
      label    = "dash-db"
      type     = "g6-nanode-1"
      firewall = "private"
    }
    spare = {
      label    = "dash-spare"
      type     = "g6-nanode-1"
      firewall = "private"
    }
  }
}

resource "linode_firewall" "public" {
  label           = "dash-public"
  inbound_policy  = "DROP"
  outbound_policy = "ACCEPT"
  tags            = ["dash"]

  inbound {
    label    = "web"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "80,443"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound {
    label    = "tailscale"
    action   = "ACCEPT"
    protocol = "UDP"
    ports    = "41641"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }
}

resource "linode_firewall" "private" {
  label           = "dash-private"
  inbound_policy  = "DROP"
  outbound_policy = "ACCEPT"
  tags            = ["dash"]

  inbound {
    label    = "tailscale"
    action   = "ACCEPT"
    protocol = "UDP"
    ports    = "41641"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }
}

resource "linode_instance" "host" {
  for_each = local.hosts

  label           = each.value.label
  region          = var.region
  type            = each.value.type
  image           = var.image
  authorized_keys = var.admin_ssh_public_keys
  private_ip      = false
  tags            = ["dash"]
  firewall_id     = each.value.firewall == "public" ? linode_firewall.public.id : linode_firewall.private.id

  metadata {
    user_data = sensitive(base64encode(templatefile("${path.module}/templates/host.yaml.tftpl", {
      hostname               = each.value.label
      admin_username         = var.admin_username
      ssh_public_keys        = var.admin_ssh_public_keys
      deploy_ssh_public_keys = each.key == "app" ? var.deploy_ssh_public_keys : []
      tailscale_auth_key     = var.tailscale_auth_key
    })))
  }

  lifecycle {
    ignore_changes = [metadata[0].user_data, authorized_keys]
  }
}

data "cloudflare_zone" "this" {
  filter = {
    name = var.zone_name
  }
}

locals {
  host_public_ipv4 = {
    for key, host in linode_instance.host :
    key => one([for ip in host.ipv4 : ip if !cidrcontains("192.168.0.0/16", ip)])
  }
  app_records = merge([
    for name in ["dash", "api.dash"] : {
      "${name}-A" = {
        name    = "${name}.${var.zone_name}"
        type    = "A"
        content = local.host_public_ipv4["app"]
      }
      "${name}-AAAA" = {
        name    = "${name}.${var.zone_name}"
        type    = "AAAA"
        content = split("/", linode_instance.host["app"].ipv6)[0]
      }
    }
  ]...)
}

resource "cloudflare_dns_record" "app" {
  for_each = local.app_records

  zone_id = data.cloudflare_zone.this.zone_id
  name    = each.value.name
  type    = each.value.type
  content = each.value.content
  ttl     = 300
  proxied = false
  comment = "Managed by OpenTofu in Good-Ground-Collective/dash"
}
