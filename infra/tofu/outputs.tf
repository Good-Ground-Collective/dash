output "hosts" {
  description = "Public addresses per box. SSH goes over the tailnet, not these."
  value = {
    for key, host in linode_instance.host : host.label => {
      id   = host.id
      ipv4 = one([for ip in host.ipv4 : ip if !cidrcontains("192.168.0.0/16", ip)])
      ipv6 = split("/", host.ipv6)[0]
    }
  }
}

output "dns_records" {
  description = "Cloudflare records managed here."
  value       = sort([for record in cloudflare_dns_record.app : "${record.type} ${record.name}"])
}
