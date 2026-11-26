# The three idle DoubleL boxes are adopted at their successor's address so
# the plan replaces them. Delete this file after the first apply.
import {
  to = linode_instance.host["app"]
  id = "13293450"
}

import {
  to = linode_instance.host["db"]
  id = "32203071"
}

import {
  to = linode_instance.host["spare"]
  id = "32819033"
}
