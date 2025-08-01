---
layout: page
title: Thank you! 🙏
subtitle: Tip me a cup of tea 🫖🧘
---
<?php
    if (isset($_GET['meditate-min'])) {
        echo $_GET['meditate-min'];
    } else {
        // Fallback behaviour goes here
    }
?>
<div class="main-explain-area jumbotron centered" style="text-align: center">
    <h3>Paypal</h3>
    <form action="https://www.paypal.com/donate" method="post" target="_top">
    <input type="hidden" name="business" value="NKYCZ67AW43YJ" />
    <input type="hidden" name="no_recurring" value="0" />
    <input type="hidden" name="item_name" value="Thank you :)" />
    <input type="hidden" name="currency_code" value="EUR" />
    <input type="image" src="https://www.paypalobjects.com/en_US/AT/i/btn/btn_donateCC_LG.gif" border="0" name="submit" title="PayPal - The safer, easier way to pay online!" alt="Donate with PayPal button" />
    <img alt="" border="0" src="https://www.paypal.com/en_AT/i/scr/pixel.gif" width="1" height="1" />
    </form>
</div>
<div class="main-explain-area jumbotron centered" style="text-align: center">
    <h3>Buymeacoffe.com</h3>
    <a href="https://www.buymeacoffee.com/floriangeix" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
    <br />
    <br />
    <img style="width: 25%" src="{{ 'bmc_qr.png' | relative_url }}" alt="Not found" />
</div>

