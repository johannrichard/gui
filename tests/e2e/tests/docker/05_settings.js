module.exports = {
    'Settings': function(browser) {
        browser
            .press('.CascadingListItem:nth-child(1) [data-montage-id=settings]')
            .waitForElementVisible('.CascadingListItem:nth-child(2) div.SectionSettings');
        browser.expect.element('.CascadingListItem:nth-child(2) div.SectionSettings .Inspector-header').text.to.equal('Docker settings');
        browser.expect.element('.CascadingListItem:nth-child(2) div.SectionSettings div.ContainerSettings').to.be.present.before(5000);
    }
};
