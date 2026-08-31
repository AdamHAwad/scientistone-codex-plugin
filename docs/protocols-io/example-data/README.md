# Practice data

`bean-seedling-growth.csv` is a made-up dataset for the Scientist1 beginner protocol. It has 24 rows, with 12 seedlings in each light group. No real experiment, person, animal, or private record is represented.

For each row:

- `plant_id` is a made-up label.
- `light_hours_per_day` is either 8 or 12.
- `start_height_cm` is the made-up starting height in centimeters.
- `day7_height_cm` is the made-up height after seven days.

The intended teaching measure is:

```text
growth_cm = day7_height_cm - start_height_cm
```

The file is released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). You may copy, change, and share it without asking permission.

For a simple check, the 8-hour group has mean growth of about 3.13 cm. The 12-hour group has mean growth of about 4.43 cm. The 12-hour minus 8-hour difference is about 1.29 cm. A two-sided 95% Welch confidence interval for that difference is about 1.16 to 1.42 cm.
