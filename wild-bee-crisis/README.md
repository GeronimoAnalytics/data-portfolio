# True Scale Data Viz: The Wild Bee Crisis

When people think of "bee extinction", they almost always think of the honeybee. But honeybees are basically like farm animals. They are taken care of and fed by beekeepers.

The real crisis is happening in silence to our wild bees. The Netherlands has over 350 species of wild bees and bumblebees. They don’t have a beekeeper to look after them, and their numbers have dropped massively since 1950.

For a personal Power BI report, I wanted to make this hidden micro-world visible. Every now and then I check in on Kerry Kolosko's work as her creativity is unmatched. Inspired by one of her projects, I built an interactive canvas in Power BI using HTML/SVG where two things come together:

1. The Macro trend: An area chart showing the decline of our wild bee population since 1950. (Purposely honeybees are not included here!).

2. The Micro world: A dynamic, physical ruler that shows four wild bee species - from the Tiny Furrow Bee 6mm to the Buff-tailed Bumblebee 22mm - exactly 1:1 on true scale on your screen.

The technical challenge was making a ruler in Power BI that reliably measures exactly 22mm on any computer monitor. You have to calculate the user's PPI (Pixels Per Inch) and Windows scaling. With some hardware parameters and quite a bit of SVG, I corrected the inner white space of the vector files. The result? A vector bumblebee that is accurate down to the millimeter on the screen.


## Preview Asset

![Wild Bee Crisis](./Bee.png)
