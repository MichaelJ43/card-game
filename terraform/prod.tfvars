turn_compute_mode           = "asg"
turn_instance_type          = "t3.micro"
# Idle scale-to-zero (min/desired 0); Lambdas only adjust desired capacity. CPU target disabled to avoid ASG scaling in an idle coturn instance.
turn_asg_min_size           = 0
turn_asg_desired_capacity   = 0
turn_asg_max_size           = 3
turn_asg_cpu_target_percent = 0
