import { expect, test } from '@playwright/test'

async function createTeamAs(page, name, teamName = `${name} Crew`) {
  await page.goto('/')
  await page.getByTestId('player-name').fill(name)
  await page.getByTestId('team-name').fill(teamName)
  await page.getByTestId('create-team').click()
  await expect(page.getByTestId('team-code-value')).toBeVisible()
  return page.getByTestId('team-code-value').innerText()
}

async function joinTeamAs(page, name, code) {
  await page.goto(`/?team=${code}`)
  await page.getByTestId('player-name').fill(name)
  await page.getByTestId('join-team').click()
  await expect(page.getByTestId('lobby-players')).toContainText(name)
}

async function unlockProtectedView(page) {
  await expect(page.getByTestId('protected-password')).toBeVisible()
  await page.getByTestId('protected-password').fill('TheConductorIsHere')
  await page.getByTestId('unlock-protected-view').click()
}

// The controlling player is the one who both sees this line's train and has a
// draggable parcel in the shared pool. Parcels are no longer tied to a line, so
// the first pool parcel (`parcel-parcel-1`) is the reliable signal.
async function getActivePageForLine(pages, lineId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    for (const currentPage of pages) {
      const controlsLine =
        (await currentPage.getByTestId(`train-${lineId}`).count()) > 0
      const parcel = currentPage.getByTestId('parcel-parcel-1')
      const canDrag = (await parcel.count()) > 0 && (await parcel.isEnabled())
      if (controlsLine && canDrag) {
        return currentPage
      }
    }
    await pages[0].waitForTimeout(250)
  }

  throw new Error(`Could not find active player for ${lineId}`)
}

// dnd-kit measures droppable rects on an animation frame after the drag
// activates, so we wait for the drag overlay to appear and then nudge the
// pointer once more to force a fresh collision check before releasing. This is
// far more reliable than locator.dragTo for dnd-kit.
async function performDrag(page, source, target, { expectDrop = true } = {}) {
  await waitForTrainsSettled(page)
  await source.scrollIntoViewIfNeeded()
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  const sourceX = sourceBox.x + sourceBox.width / 2
  const sourceY = sourceBox.y + sourceBox.height / 2
  const targetX = targetBox.x + targetBox.width / 2
  const targetY = targetBox.y + targetBox.height / 2

  await page.mouse.move(sourceX, sourceY)
  await page.mouse.down()
  await page.mouse.move(targetX, targetY, { steps: 12 })
  await expect(page.getByTestId('drag-overlay')).toBeVisible()

  if (expectDrop) {
    // Wait until dnd-kit reports the pointer is over the target carriage (it
    // adds the drop-target class) so the drop registers deterministically on
    // the intended carriage, even when the machine is under load.
    await expect(target).toHaveClass(/drop-target/)
  } else {
    await page.mouse.move(targetX + 1, targetY + 1)
    await page.mouse.move(targetX, targetY)
  }
  await page.mouse.up()
}

// The trains slide in on arrival; wait until that animation has settled so drag
// coordinates are stable and drops land on the intended carriage. The arrival
// keyframes hold their translateX via `both` fill, so a transform check is more
// reliable than getAnimations() (which can be momentarily empty right after the
// consist mounts, before the CSS animation registers).
async function waitForTrainsSettled(page) {
  await page.locator('.train-consist').first().waitFor()
  await page.waitForFunction(() => {
    const consists = [...document.querySelectorAll('.train-consist')]
    if (consists.length === 0) {
      return false
    }
    return consists.every((consist) => {
      // Departing consists intentionally translate off-screen; ignore them.
      if (consist.classList.contains('departed')) {
        return true
      }
      const transform = window.getComputedStyle(consist).transform
      if (transform === 'none') {
        return true
      }
      const match = transform.match(/matrix\(([^)]+)\)/)
      if (!match) {
        return true
      }
      const translateX = Number.parseFloat(match[1].split(',')[4])
      return Math.abs(translateX) < 1
    })
  })
}

async function carriageCountForLine(page, lineId) {
  return page.locator(`[data-testid^="carriage-${lineId}-carriage-"]`).count()
}

// Parcels are a shared, fungible pool: `parcel-parcel-1` is always the next
// available parcel while any remain, so we drag it repeatedly to fill a line.
async function loadLineFully(page, lineId) {
  const carriageCount = await carriageCountForLine(page, lineId)

  for (let index = 0; index < carriageCount; index += 1) {
    await performDrag(
      page,
      page.getByTestId('parcel-parcel-1'),
      page.getByTestId(`carriage-${lineId}-carriage-${index + 1}`),
    )
    await expect(
      page.getByTestId(`progress-${lineId}-carriage-${index + 1}`),
    ).toContainText('1/1')
  }

  return carriageCount
}

test('setup allows selecting line count and shows split distribution', async ({ page }) => {
  const code = await createTeamAs(page, 'Host')
  await expect(code).toMatch(/^[A-Z0-9]{8}$/)
  await expect(page.getByTestId('setup-total-parcels')).toContainText('8 parcels')
  await page.getByTestId('line-count-select').selectOption('3')
  await expect(page.getByTestId('carriage-distribution')).toContainText('Line 1: 3 carriages')
  await expect(page.getByTestId('carriage-distribution')).toContainText('Line 2: 3 carriages')
  await expect(page.getByTestId('carriage-distribution')).toContainText('Line 3: 2 carriages')
})

test('creating a team with a name shows it in the lobby', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('player-name').fill('Host')
  await page.getByTestId('team-name').fill('Platform Crew')
  await page.getByTestId('create-team').click()

  await expect(page.getByTestId('team-code-value')).toBeVisible()
  await expect(page.getByTestId('team-name-value')).toContainText('Platform Crew')
})

test('reload restores the existing player session without asking to join again', async ({ page }) => {
  const code = await createTeamAs(page, 'Reloadable')

  await page.reload()

  await expect(page.getByTestId('team-code-value')).toHaveText(code)
  await expect(page.getByTestId('lobby-players')).toContainText('Reloadable')
  await expect(page.getByTestId('player-name')).toHaveCount(0)
})

test('rejoining with the same name and code does not add a duplicate player', async ({ browser, page }) => {
  const code = await createTeamAs(page, 'Returning')
  const returningContext = await browser.newContext()
  const returningPage = await returningContext.newPage()

  await joinTeamAs(returningPage, 'Returning', code)
  await expect(returningPage.getByTestId('lobby-players').locator('li')).toHaveCount(1)

  await returningContext.close()
})

test('admin can see active teams and cancel an in-game session', async ({ page }) => {
  const before = await page.request.get('/api/admin/overview').then((response) => response.json())
  await createTeamAs(page, 'Admin Target')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('train-line-1')).toBeVisible()
  const code = await page.evaluate(() => new URL(window.location.href).searchParams.get('team'))

  const adminPage = await page.context().newPage()
  await adminPage.goto('/admin')
  await unlockProtectedView(adminPage)
  await expect(adminPage.getByTestId('admin-page')).toBeVisible()
  await expect(adminPage.getByTestId('active-team-count')).toHaveText(
    String(before.counts.active + 1),
  )
  await adminPage.getByTestId(`cancel-team-${code}`).click()
  await expect(adminPage.getByTestId('active-team-count')).toHaveText(
    String(before.counts.active),
  )
  await expect(page.getByTestId('team-code-value')).toHaveText(code)
  expect(code).toBeTruthy()
})

test('live statistics page shows persisted team status data', async ({ page }) => {
  const code = await createTeamAs(page, 'Stats Viewer')
  const statsPage = await page.context().newPage()

  await statsPage.goto('/stats')
  await unlockProtectedView(statsPage)
  await expect(statsPage.getByTestId('stats-page')).toBeVisible()
  await expect(statsPage.getByTestId(`team-status-${code}`)).toHaveText('lobby')
  await expect(statsPage.getByTestId('team-status-counts')).toContainText('lobby')
})

test('creating a team without a team name is rejected', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('player-name').fill('Host')
  await page.getByTestId('create-team').click()

  await expect(page.getByText('Please enter a team name.')).toBeVisible()
  await expect(page.getByTestId('team-code-value')).toHaveCount(0)
  await expect(page.getByTestId('create-team')).toBeVisible()
})

test('a whitespace-only team name is rejected', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('player-name').fill('Host')
  await page.getByTestId('team-name').fill('   ')
  await page.getByTestId('create-team').click()

  await expect(page.getByText('Please enter a team name.')).toBeVisible()
  await expect(page.getByTestId('team-code-value')).toHaveCount(0)
})

test('host sees lobby updates and turn passes to next player after play', async ({ browser, page }) => {
  const code = await createTeamAs(page, 'Host')

  const guestContext = await browser.newContext()
  const guestPage = await guestContext.newPage()
  await joinTeamAs(guestPage, 'Guest', code)

  await expect(page.getByTestId('lobby-players')).toContainText('Guest')

  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()

  const pages = [page, guestPage]
  const actingPage = await getActivePageForLine(pages, 'line-1')
  const waitingPage = actingPage === page ? guestPage : page
  const isHostActing = actingPage === page

  // Only the active player sees the train; the other sees an empty rail with a
  // waiting message until the train is shipped their way.
  await expect(actingPage.getByTestId('train-line-1')).toBeVisible()
  await expect(waitingPage.getByTestId('waiting-line-1')).toBeVisible()
  await expect(waitingPage.getByTestId('train-line-1')).toHaveCount(0)

  const carriages = actingPage.locator('[data-testid^="carriage-line-1-carriage-"]')
  await expect(carriages).toHaveCount(8)

  await loadLineFully(actingPage, 'line-1')

  const shipButton = actingPage.getByTestId('ship-line-1')
  await expect(shipButton).toBeVisible()
  await shipButton.click()

  await expect(page.getByTestId('total-shipped')).toContainText('8 parcels shipped')
  await expect(page.getByTestId('score-log')).toContainText('shipped 8 on line-1')

  // The train now animates onto the previously waiting player's screen. The
  // player who just shipped keeps an empty rail (their part is complete).
  await expect(waitingPage.getByTestId('train-line-1')).toBeVisible()
  await expect(waitingPage.getByTestId('parcel-parcel-1')).toBeEnabled()
  await expect(actingPage.getByTestId('shipped-line-1')).toBeVisible()
  await expect(actingPage.getByTestId('waiting-line-1')).toHaveCount(0)

  if (isHostActing) {
    await expect(page.getByTestId('shipped-line-1')).toBeVisible()
    await expect(guestPage.getByTestId('parcel-parcel-1')).toBeEnabled()
  } else {
    await expect(guestPage.getByTestId('shipped-line-1')).toBeVisible()
    await expect(page.getByTestId('parcel-parcel-1')).toBeEnabled()
  }

  await guestContext.close()
})

test('the active player sees their train arrive rather than a global waiting box', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()

  // A solo player owns the line from the start, so there is no waiting rail for
  // them; the train animates straight in and its carriages become interactive.
  await expect(page.getByTestId('waiting-line-1')).toHaveCount(0)
  await expect(page.getByTestId('train-line-1')).toBeVisible()
  await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()
})

test('dropping a parcel onto a carriage loads it and updates progress', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()

  await performDrag(
    page,
    page.getByTestId('parcel-parcel-1'),
    page.getByTestId('carriage-line-1-carriage-1'),
  )

  await expect(page.getByTestId('progress-line-1-carriage-1')).toContainText('1/1')
  // Loading one parcel converts one shared-pool slot into a placeholder.
  await expect(page.getByTestId('parcel-slot-placeholder-1')).toBeVisible()
  await expect(page.getByTestId('carriage-line-1-carriage-1')).toContainText('0 parcels needed')
})

test('dragging a parcel near the screen edges scrolls the page', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 400 })
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()

  const parcel = page.getByTestId('parcel-parcel-1')
  await parcel.scrollIntoViewIfNeeded()
  const parcelBox = await parcel.boundingBox()
  const startX = parcelBox.x + parcelBox.width / 2
  const startY = parcelBox.y + parcelBox.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 10, startY + 10)
  await expect(page.getByTestId('drag-overlay')).toBeVisible()

  const initialScrollY = await page.evaluate(() => window.scrollY)
  await page.mouse.move(startX + 10, 695)
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 })
    .toBeGreaterThan(initialScrollY)

  const bottomScrollY = await page.evaluate(() => window.scrollY)
  await page.mouse.move(startX + 10, 5)
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 })
    .toBeLessThan(bottomScrollY)

  await page.mouse.up()
})

test('two consecutive drags are accepted into two carriages', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-1-carriage-2')).toBeVisible()

  await performDrag(
    page,
    page.getByTestId('parcel-parcel-1'),
    page.getByTestId('carriage-line-1-carriage-1'),
  )
  await expect(page.getByTestId('progress-line-1-carriage-1')).toContainText('1/1')

  await performDrag(
    page,
    page.getByTestId('parcel-parcel-1'),
    page.getByTestId('carriage-line-1-carriage-2'),
  )

  await expect(page.getByTestId('progress-line-1-carriage-1')).toContainText('1/1')
  await expect(page.getByTestId('progress-line-1-carriage-2')).toContainText('1/1')
  await expect(page.getByTestId('parcel-slot-placeholder-1')).toBeVisible()
  await expect(page.getByTestId('parcel-slot-placeholder-2')).toBeVisible()
})

test('a shared-pool parcel can be dropped onto a carriage on any line', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('2')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-2-carriage-1')).toBeVisible()

  await performDrag(
    page,
    page.getByTestId('parcel-parcel-1'),
    page.getByTestId('carriage-line-2-carriage-1'),
  )

  await expect(page.getByTestId('progress-line-2-carriage-1')).toContainText('1/1')
  await expect(page.getByTestId('progress-line-1-carriage-1')).toContainText('0/1')
})

test('play button does not appear before a line is fully loaded', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()

  await expect(page.getByTestId('ship-line-1')).toBeHidden()

  await performDrag(
    page,
    page.getByTestId('parcel-parcel-1'),
    page.getByTestId('carriage-line-1-carriage-1'),
  )

  await expect(page.getByTestId('ship-line-1')).toBeHidden()
})

test('dropping a parcel outside carriages keeps it on platform', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()

  const parcel = page.getByTestId('parcel-parcel-1')
  await performDrag(page, parcel, page.getByLabel('Shipping score'), {
    expectDrop: false,
  })

  await expect(page.getByTestId('parcel-parcel-1')).toBeVisible()
  await expect(page.getByTestId('progress-line-1-carriage-1')).toContainText('0/1')
})

test('full carriage rejects additional parcel', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()

  await performDrag(
    page,
    page.getByTestId('parcel-parcel-1'),
    page.getByTestId('carriage-line-1-carriage-1'),
  )
  await expect(page.getByTestId('progress-line-1-carriage-1')).toContainText('1/1')
  await performDrag(
    page,
    page.getByTestId('parcel-parcel-1'),
    page.getByTestId('carriage-line-1-carriage-1'),
    { expectDrop: false },
  )

  await expect(page.getByTestId('progress-line-1-carriage-1')).toContainText('1/1')
  await expect(page.getByTestId('parcel-parcel-1')).toBeVisible()
})

test('single-player game completes and train leaves after last shipment', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()

  for (let index = 1; index <= 8; index += 1) {
    await performDrag(
      page,
      page.getByTestId('parcel-parcel-1'),
      page.getByTestId(`carriage-line-1-carriage-${index}`),
    )
    await expect(
      page.getByTestId(`progress-line-1-carriage-${index}`),
    ).toContainText('1/1')
  }

  await page.getByTestId('ship-line-1').click()

  await expect(page.getByTestId('game-complete')).toBeVisible()
  await expect(page.getByTestId('game-complete')).toContainText('Game 1 Complete')
  await expect(page.getByTestId('total-shipped')).toContainText('8 parcels shipped')
  await expect(page.getByTestId('ship-line-1')).toHaveCount(0)
})

test('a completed game can be restarted and each game is tracked separately', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()

  await loadLineFully(page, 'line-1')
  await page.getByTestId('ship-line-1').click()

  await expect(page.getByTestId('game-complete')).toContainText('Game 1 Complete')
  await expect(page.getByTestId('total-shipped')).toContainText('8 parcels shipped')

  // Start again takes the team back to the lobby.
  await page.getByTestId('play-again').click()

  await expect(page.getByTestId('lobby-players')).toBeVisible()
  await expect(page.getByTestId('game-history')).toContainText('Game 1: 8 parcels shipped')

  // The leader can choose how many rails again, just like the first game.
  await page.getByTestId('line-count-select').selectOption('2')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-2-carriage-1')).toBeVisible()

  // The score log starts fresh for the new game.
  await expect(page.getByTestId('total-shipped')).toContainText('0 parcels shipped')

  await loadLineFully(page, 'line-1')
  await page.getByTestId('ship-line-1').click()
  await expect(page.getByTestId('total-shipped')).toContainText('4 parcels shipped')

  await loadLineFully(page, 'line-2')
  await page.getByTestId('ship-line-2').click()

  await expect(page.getByTestId('game-complete')).toContainText('Game 2 Complete')
  await expect(page.getByTestId('total-shipped')).toContainText('8 parcels shipped')
})

test('shipped train slides out to the right instead of disappearing', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()

  await loadLineFully(page, 'line-1')

  const train = page.getByTestId('train-line-1')
  const startX = (await train.boundingBox()).x

  await page.getByTestId('ship-line-1').click()

  // The departure must be an animation (moving right over time), not an instant
  // jump. Assert the keyframe animation is applied and running.
  await expect(train).toHaveClass(/departed/)
  const departure = await train.evaluate((element) => {
    const animation = element
      .getAnimations()
      .find((candidate) => candidate.animationName === 'departToRight')

    return animation
      ? { name: animation.animationName, state: animation.playState }
      : null
  })
  expect(departure).not.toBeNull()
  expect(departure.state).toBe('running')

  // Mid-flight the train has moved right but is not yet fully off screen.
  await page.waitForTimeout(300)
  const midX = (await train.boundingBox()).x
  expect(midX).toBeGreaterThan(startX + 20)

  // It continues sliding further right (it is animating, not stuck).
  await page.waitForTimeout(500)
  const laterX = (await train.boundingBox()).x
  expect(laterX).toBeGreaterThan(midX)
})

// The horizontal scroll changed the resting position: a settled train sits at
// the left of its line (the scroll origin) rather than centred, so the
// arrival/departure slide must start and end there for both short and long
// trains. These cover a short train that fits the line and a long train that
// overflows it.
test.describe('train resting alignment with horizontal scrolling', () => {
  async function measureLine(page, lineId) {
    return page.getByTestId(`train-${lineId}`).evaluate((consist) => {
      const scroll = consist.closest('.train-scroll')
      const scrollBox = scroll.getBoundingClientRect()
      const consistBox = consist.getBoundingClientRect()
      return {
        restingOffset: Math.round(consistBox.left - scrollBox.left),
        overflow: scroll.scrollWidth - scroll.clientWidth,
        isScrollable: scroll.classList.contains('is-scrollable'),
      }
    })
  }

  test('a short train that fits the line rests flush at the left, not centred', async ({ page }) => {
    // Four lines split the eight carriages into short two-carriage consists that
    // are narrower than the line at a desktop width.
    await page.setViewportSize({ width: 1100, height: 900 })
    await createTeamAs(page, 'Short Rester')
    await page.getByTestId('line-count-select').selectOption('4')
    await page.getByTestId('start-round').click()
    await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()
    await waitForTrainsSettled(page)
    await expect(page.getByTestId('line-scroll-line-1')).toHaveClass(/is-scrollable/)

    const measured = await measureLine(page, 'line-1')
    // It fits (no overflow) yet still rests at the left edge rather than centred.
    expect(measured.overflow).toBe(0)
    expect(Math.abs(measured.restingOffset)).toBeLessThanOrEqual(1)
  })

  test('a long train that overflows the line rests at the left and can scroll', async ({ page }) => {
    // A single line keeps all eight carriages together; at a phone width the
    // consist is far longer than the line.
    await page.setViewportSize({ width: 360, height: 740 })
    await createTeamAs(page, 'Long Rester')
    await page.getByTestId('line-count-select').selectOption('1')
    await page.getByTestId('start-round').click()
    await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()
    await waitForTrainsSettled(page)
    await expect(page.getByTestId('line-scroll-line-1')).toHaveClass(/is-scrollable/)

    const measured = await measureLine(page, 'line-1')
    expect(measured.overflow).toBeGreaterThan(0)
    expect(Math.abs(measured.restingOffset)).toBeLessThanOrEqual(1)
  })

  test('the arrival slide lands at the same left resting position (no centre jump)', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 })
    await createTeamAs(page, 'Arrival Watcher')
    await page.getByTestId('line-count-select').selectOption('4')
    await page.getByTestId('start-round').click()

    const train = page.getByTestId('train-line-1')

    // While arriving the consist is translated in from the left (negative X).
    await expect(train).toHaveClass(/arriving/)
    const arrivingTransform = await train.evaluate(
      (element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41,
    )
    expect(arrivingTransform).toBeLessThan(0)

    // Once settled the transform is cleared and it rests flush left, meaning the
    // slide ended exactly where the train sits (no snap from centre to left).
    await waitForTrainsSettled(page)
    const settled = await measureLine(page, 'line-1')
    expect(Math.abs(settled.restingOffset)).toBeLessThanOrEqual(1)
    const settledTransform = await train.evaluate(
      (element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41,
    )
    expect(Math.abs(settledTransform)).toBeLessThan(1)
  })

  test('the departure slide leaves from the left resting position', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 })
    await createTeamAs(page, 'Departure Watcher')
    await page.getByTestId('line-count-select').selectOption('4')
    await page.getByTestId('start-round').click()
    await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()
    await waitForTrainsSettled(page)

    const train = page.getByTestId('train-line-1')
    const restingLeft = (await train.boundingBox()).x

    await loadLineFully(page, 'line-1')
    await page.getByTestId('ship-line-1').click()
    await expect(train).toHaveClass(/departed/)

    // The very start of the departure is anchored at the resting left position,
    // then it slides rightwards off screen.
    await page.waitForTimeout(300)
    const midX = (await train.boundingBox()).x
    expect(midX).toBeGreaterThan(restingLeft + 20)
  })
})


test('all trains arrive on screen when a multi-line round starts', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('3')
  await page.getByTestId('start-round').click()

  await expect(page.getByTestId('train-line-1')).toBeVisible()
  await expect(page.getByTestId('train-line-2')).toBeVisible()
  await expect(page.getByTestId('train-line-3')).toBeVisible()
  await expect(page.getByTestId('waiting-line-1')).toHaveCount(0)
})

test('two lines can be loaded and shipped independently by one player', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('2')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-2-carriage-1')).toBeVisible()

  const lineOneCarriages = await loadLineFully(page, 'line-1')
  expect(lineOneCarriages).toBe(4)

  await expect(page.getByTestId('ship-line-1')).toBeVisible()
  await expect(page.getByTestId('ship-line-2')).toBeHidden()

  await page.getByTestId('ship-line-1').click()

  await expect(page.getByTestId('total-shipped')).toContainText('4 parcels shipped')
  await expect(page.getByTestId('score-log')).toContainText('shipped 4 on line-1')
  await expect(page.getByTestId('ship-line-1')).toHaveCount(0)
  await expect(page.getByTestId('carriage-line-2-carriage-1')).toBeVisible()

  const lineTwoCarriages = await loadLineFully(page, 'line-2')
  expect(lineTwoCarriages).toBe(4)

  await page.getByTestId('ship-line-2').click()

  await expect(page.getByTestId('game-complete')).toBeVisible()
  await expect(page.getByTestId('total-shipped')).toContainText('8 parcels shipped')
})

test('three lines distribute carriages and each ships to complete the round', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('3')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-3-carriage-1')).toBeVisible()

  expect(await carriageCountForLine(page, 'line-1')).toBe(3)
  expect(await carriageCountForLine(page, 'line-2')).toBe(3)
  expect(await carriageCountForLine(page, 'line-3')).toBe(2)

  await loadLineFully(page, 'line-1')
  await page.getByTestId('ship-line-1').click()
  await expect(page.getByTestId('total-shipped')).toContainText('3 parcels shipped')

  await loadLineFully(page, 'line-2')
  await page.getByTestId('ship-line-2').click()
  await expect(page.getByTestId('total-shipped')).toContainText('6 parcels shipped')

  await loadLineFully(page, 'line-3')
  await page.getByTestId('ship-line-3').click()

  await expect(page.getByTestId('game-complete')).toBeVisible()
  await expect(page.getByTestId('total-shipped')).toContainText('8 parcels shipped')
})

test('the bottom line can be filled and shipped first while other lines remain', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('3')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-3-carriage-1')).toBeVisible()

  // Fill the bottom line first, with lines 1 and 2 still on screen.
  await loadLineFully(page, 'line-3')

  await expect(page.getByTestId('progress-line-3-carriage-1')).toContainText('1/1')
  await expect(page.getByTestId('progress-line-3-carriage-2')).toContainText('1/1')
  // The upper lines are untouched.
  await expect(page.getByTestId('progress-line-1-carriage-1')).toContainText('0/1')
  await expect(page.getByTestId('progress-line-2-carriage-1')).toContainText('0/1')

  await expect(page.getByTestId('ship-line-3')).toBeVisible()
  await page.getByTestId('ship-line-3').click()
  await expect(page.getByTestId('total-shipped')).toContainText('2 parcels shipped')
})

test('carriages can be filled in any order, not just right to left', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('2')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()

  const carriageCount = await carriageCountForLine(page, 'line-1')

  // Fill carriages from the last one back to the first, so ordering is clearly
  // not enforced.
  for (let offset = 0; offset < carriageCount; offset += 1) {
    const carriageIndex = carriageCount - offset
    await performDrag(
      page,
      page.getByTestId('parcel-parcel-1'),
      page.getByTestId(`carriage-line-1-carriage-${carriageIndex}`),
    )
    await expect(
      page.getByTestId(`progress-line-1-carriage-${carriageIndex}`),
    ).toContainText('1/1')
  }

  await expect(page.getByTestId('ship-line-1')).toBeVisible()
})

test('loading one line does not change another line progress', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('2')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-2-carriage-1')).toBeVisible()

  await performDrag(
    page,
    page.getByTestId('parcel-parcel-1'),
    page.getByTestId('carriage-line-1-carriage-1'),
  )

  await expect(page.getByTestId('progress-line-1-carriage-1')).toContainText('1/1')
  await expect(page.getByTestId('progress-line-2-carriage-1')).toContainText('0/1')
})

test('the shared pool feeds carriages across every line', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('3')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-3-carriage-1')).toBeVisible()

  // One shared pool of 8 parcels feeds all three lines.
  await expect(page.getByTestId('parcel-slot-parcel-8')).toBeVisible()

  for (const lineId of ['line-1', 'line-2', 'line-3']) {
    await performDrag(
      page,
      page.getByTestId('parcel-parcel-1'),
      page.getByTestId(`carriage-${lineId}-carriage-1`),
    )
    await expect(
      page.getByTestId(`progress-${lineId}-carriage-1`),
    ).toContainText('1/1')
  }

  // Three parcels consumed from the shared pool, so only five remain available.
  await expect(page.getByTestId('parcel-slot-parcel-5')).toBeVisible()
  await expect(page.getByTestId('parcel-slot-parcel-6')).toHaveCount(0)
})

test('each line ship button appears only when that line is fully loaded', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('2')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-2-carriage-1')).toBeVisible()

  await expect(page.getByTestId('ship-line-1')).toBeHidden()
  await expect(page.getByTestId('ship-line-2')).toBeHidden()

  await loadLineFully(page, 'line-1')

  await expect(page.getByTestId('ship-line-1')).toBeVisible()
  await expect(page.getByTestId('ship-line-2')).toBeHidden()

  await loadLineFully(page, 'line-2')

  await expect(page.getByTestId('ship-line-1')).toBeVisible()
  await expect(page.getByTestId('ship-line-2')).toBeVisible()
})

test('a shipped line leaves and does not accept more parcels', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('2')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()

  await loadLineFully(page, 'line-1')
  await page.getByTestId('ship-line-1').click()

  await expect(page.getByTestId('total-shipped')).toContainText('4 parcels shipped')
  await expect(page.getByTestId('train-line-1')).toHaveClass(/departed/)
})

test('two players relay both lines of a round through the full cycle', async ({ browser, page }) => {
  const code = await createTeamAs(page, 'Host')

  const guestContext = await browser.newContext()
  const guestPage = await guestContext.newPage()
  await joinTeamAs(guestPage, 'Guest', code)

  await expect(page.getByTestId('lobby-players')).toContainText('Guest')

  await page.getByTestId('line-count-select').selectOption('2')
  await page.getByTestId('start-round').click()

  const pages = [page, guestPage]

  // The first player owns both lines at the start of the round; the other
  // player waits on empty rails until each train is shipped their way.
  const firstActor = await getActivePageForLine(pages, 'line-1')
  const secondActor = firstActor === page ? guestPage : page
  await expect(firstActor.getByTestId('train-line-2')).toBeVisible()
  await expect(secondActor.getByTestId('waiting-line-1')).toBeVisible()
  await expect(secondActor.getByTestId('waiting-line-2')).toBeVisible()

  await loadLineFully(firstActor, 'line-1')
  await firstActor.getByTestId('ship-line-1').click()
  await loadLineFully(firstActor, 'line-2')
  await firstActor.getByTestId('ship-line-2').click()

  await expect(firstActor.getByTestId('total-shipped')).toContainText('8 parcels shipped')

  // Both trains now relay to the second player, who completes the round.
  await expect(secondActor.getByTestId('train-line-1')).toBeVisible()
  await expect(secondActor.getByTestId('train-line-2')).toBeVisible()

  await loadLineFully(secondActor, 'line-1')
  await secondActor.getByTestId('ship-line-1').click()
  await loadLineFully(secondActor, 'line-2')
  await secondActor.getByTestId('ship-line-2').click()

  await expect(page.getByTestId('game-complete')).toBeVisible()
  await expect(page.getByTestId('total-shipped')).toContainText('16 parcels shipped')

  await guestContext.close()
})

test('a shipped train relays from one player to the next across a full round', async ({ browser, page }) => {
  const code = await createTeamAs(page, 'Host')

  const guestContext = await browser.newContext()
  const guestPage = await guestContext.newPage()
  await joinTeamAs(guestPage, 'Guest', code)

  await expect(page.getByTestId('lobby-players')).toContainText('Guest')

  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()

  const pages = [page, guestPage]

  // First owner has the train; the other player's rail is empty and waiting.
  const firstOwner = await getActivePageForLine(pages, 'line-1')
  const secondOwner = firstOwner === page ? guestPage : page
  await expect(firstOwner.getByTestId('train-line-1')).toBeVisible()
  await expect(secondOwner.getByTestId('waiting-line-1')).toBeVisible()
  await expect(secondOwner.getByTestId('train-line-1')).toHaveCount(0)

  // First owner loads locally and ships the train onward.
  await loadLineFully(firstOwner, 'line-1')
  await firstOwner.getByTestId('ship-line-1').click()

  // The train slides off the first owner's screen, leaving an empty (complete)
  // rail, and arrives for the second owner with a fresh parcel pool.
  await expect(firstOwner.getByTestId('shipped-line-1')).toBeVisible()
  await expect(firstOwner.getByTestId('waiting-line-1')).toHaveCount(0)
  await expect(secondOwner.getByTestId('train-line-1')).toBeVisible()
  await expect(secondOwner.getByTestId('carriage-line-1-carriage-1')).toBeVisible()
  await expect(secondOwner.getByTestId('parcel-parcel-1')).toBeEnabled()

  // Second owner completes their turn, finishing the two-turn round.
  await loadLineFully(secondOwner, 'line-1')
  await secondOwner.getByTestId('ship-line-1').click()

  await expect(page.getByTestId('game-complete')).toBeVisible()
  await expect(page.getByTestId('total-shipped')).toContainText('16 parcels shipped')

  await guestContext.close()
})

test('the dragged parcel box follows the cursor', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()

  const parcel = page.getByTestId('parcel-parcel-1')
  const box = await parcel.boundingBox()
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 80, startY + 60, { steps: 10 })

  const overlay = page.getByTestId('drag-overlay')
  await expect(overlay).toBeVisible()

  const firstBox = await overlay.boundingBox()
  const firstCenterX = firstBox.x + firstBox.width / 2
  const firstCenterY = firstBox.y + firstBox.height / 2
  expect(Math.abs(firstCenterX - (startX + 80))).toBeLessThan(30)
  expect(Math.abs(firstCenterY - (startY + 60))).toBeLessThan(30)

  await page.mouse.move(startX + 200, startY + 140, { steps: 10 })
  const secondBox = await overlay.boundingBox()
  const secondCenterX = secondBox.x + secondBox.width / 2
  const secondCenterY = secondBox.y + secondBox.height / 2
  expect(secondCenterX).toBeGreaterThan(firstCenterX + 60)
  expect(secondCenterY).toBeGreaterThan(firstCenterY + 40)
  expect(Math.abs(secondCenterX - (startX + 200))).toBeLessThan(30)

  await page.mouse.up()
  await expect(page.getByTestId('drag-overlay')).toHaveCount(0)
  await expect(page.getByTestId('parcel-parcel-1')).toBeVisible()
})

test('the overlay drops into a carriage when released over it', async ({ page }) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()

  const parcel = page.getByTestId('parcel-parcel-1')
  const carriage = page.getByTestId('carriage-line-1-carriage-1')
  await waitForTrainsSettled(page)
  const parcelBox = await parcel.boundingBox()
  const carriageBox = await carriage.boundingBox()

  await page.mouse.move(parcelBox.x + parcelBox.width / 2, parcelBox.y + parcelBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    carriageBox.x + carriageBox.width / 2,
    carriageBox.y + carriageBox.height / 2,
    { steps: 12 },
  )
  await expect(page.getByTestId('drag-overlay')).toBeVisible()
  await page.mouse.up()

  await expect(page.getByTestId('progress-line-1-carriage-1')).toContainText('1/1')
  await expect(page.getByTestId('parcel-slot-placeholder-1')).toBeVisible()
})

test('every parcel across all lines in a three-line scene is dragged into a carriage', async ({
  page,
}) => {
  await createTeamAs(page, 'Solo')
  await page.getByTestId('line-count-select').selectOption('3')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-3-carriage-1')).toBeVisible()

  for (const lineId of ['line-1', 'line-2', 'line-3']) {
    const carriageCount = await loadLineFully(page, lineId)

    for (let index = 1; index <= carriageCount; index += 1) {
      await expect(
        page.getByTestId(`progress-${lineId}-carriage-${index}`),
      ).toContainText('1/1')
    }
  }

  // With every carriage loaded the shared pool has no draggable parcels left.
  const remainingParcels = await page
    .locator('[data-testid^="parcel-slot-parcel-"]')
    .count()
  expect(remainingParcels).toBe(0)

  await page.getByTestId('ship-line-1').click()
  await expect(page.getByTestId('total-shipped')).toContainText('3 parcels shipped')
  await page.getByTestId('ship-line-2').click()
  await expect(page.getByTestId('total-shipped')).toContainText('6 parcels shipped')
  await page.getByTestId('ship-line-3').click()

  await expect(page.getByTestId('game-complete')).toBeVisible()
  await expect(page.getByTestId('total-shipped')).toContainText('8 parcels shipped')
})

test('the API-served stats report analyses completed games', async ({ page }) => {
  const code = await createTeamAs(page, 'Solo', 'Report Crew')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()

  await loadLineFully(page, 'line-1')
  await page.getByTestId('ship-line-1').click()
  await expect(page.getByTestId('game-complete')).toBeVisible()

  // The report is a static page served by the API service on port 3001.
  await page.goto('http://127.0.0.1:3001/report')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByRole('alert')).toHaveText('Incorrect password.')
  await page.getByLabel('Password').fill('TheConductorIsHere')
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(
    page.getByRole('heading', { name: 'Delivery Rails · Team Stats' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Refresh' }).click()

  // Filtering to this team by its code shows only that team, and its charts render.
  const teamFilter = page.getByLabel('Filter by team name or code')
  await expect(teamFilter).toBeVisible()
  await teamFilter.selectOption(code)

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Report Crew', exact: true })).toBeVisible()
  await expect(page.locator('.panel h2')).toHaveText(['Overview', 'Report Crew'])
  await expect(page.locator('.status.error')).toHaveCount(0)
  await expect(page.locator('svg').first()).toBeVisible()
})

test('admin and reporting screens require the configured dummy password', async ({ page }) => {
  for (const [path, pageTestId] of [
    ['/admin', 'admin-page'],
    ['/stats', 'stats-page'],
  ]) {
    await page.goto(path)
    await expect(page.getByTestId('protected-screen')).toBeVisible()
    await page.getByTestId('protected-password').fill('wrong-password')
    await page.getByTestId('unlock-protected-view').click()
    await expect(page.getByTestId('protected-access-error')).toHaveText('Incorrect password.')
    await expect(page.getByTestId(pageTestId)).toHaveCount(0)

    await unlockProtectedView(page)
    await expect(page.getByTestId(pageTestId)).toBeVisible()
  }
})

test('creating a team without a player name is rejected', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('team-name').fill('Unnamed Host Crew')
  await page.getByTestId('create-team').click()

  await expect(page.getByText('Please enter your name.')).toBeVisible()
  await expect(page.getByTestId('team-code-value')).toHaveCount(0)
})

test('joining without a name or team code is rejected', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('join-team').click()
  await expect(page.getByText('Please enter your name.')).toBeVisible()

  await page.getByTestId('player-name').fill('Guest')
  await page.getByTestId('join-team').click()
  await expect(page.getByText('Please enter a team code.')).toBeVisible()
  await expect(page.getByTestId('team-code-value')).toHaveCount(0)
})

test('joining an unknown team shows the API error without leaving setup', async ({ page }) => {
  await page.goto('/?team=not-a-real-team')
  await page.getByTestId('player-name').fill('Guest')
  await page.getByTestId('join-team').click()

  await expect(page.getByText('Team not found')).toBeVisible()
  await expect(page.getByTestId('join-team')).toBeVisible()
  await expect(page.getByTestId('team-code-value')).toHaveCount(0)
})

test('team codes are case-insensitive when joining', async ({ browser, page }) => {
  const code = await createTeamAs(page, 'Host')
  const guestContext = await browser.newContext()
  const guestPage = await guestContext.newPage()

  await joinTeamAs(guestPage, 'Lowercase Guest', code.toLowerCase())
  await expect(guestPage.getByTestId('team-code-value')).toHaveText(code)

  await guestContext.close()
})

test('a new player cannot join after the host starts the game', async ({ browser, page }) => {
  const code = await createTeamAs(page, 'Host')
  await page.getByTestId('line-count-select').selectOption('1')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('train-line-1')).toBeVisible()

  const guestContext = await browser.newContext()
  const guestPage = await guestContext.newPage()
  await guestPage.goto(`/?team=${code}`)
  await guestPage.getByTestId('player-name').fill('Late Guest')
  await guestPage.getByTestId('join-team').click()

  await expect(guestPage.getByText('Team is already in an active game')).toBeVisible()
  await expect(guestPage.getByTestId('join-team')).toBeVisible()
  await guestContext.close()
})

test('a non-host cannot start a game', async ({ browser, page }) => {
  const code = await createTeamAs(page, 'Host')
  const guestContext = await browser.newContext()
  const guestPage = await guestContext.newPage()
  await joinTeamAs(guestPage, 'Guest', code)

  await expect(guestPage.getByTestId('waiting-host')).toBeVisible()
  await expect(guestPage.getByTestId('start-round')).toHaveCount(0)

  const guestSession = await guestPage.evaluate(() =>
    JSON.parse(localStorage.getItem('delivery-training-session')),
  )
  const response = await guestPage.request.post(`/api/teams/${code}/start`, {
    data: { playerId: guestSession.playerId, lineCount: 1 },
  })
  expect(response.status()).toBe(403)
  expect((await response.json()).error).toBe('Only the host can start the game')

  await guestContext.close()
})

test('starting an already active game returns a conflict', async ({ page }) => {
  const code = await createTeamAs(page, 'Host')
  const hostSession = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('delivery-training-session')),
  )

  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('train-line-1')).toBeVisible()

  const response = await page.request.post(`/api/teams/${code}/start`, {
    data: { playerId: hostSession.playerId, lineCount: 1 },
  })
  expect(response.status()).toBe(409)
  expect((await response.json()).error).toBe('Game is already active')
})

test('unknown and unauthorized game actions are rejected by the API', async ({ page }) => {
  await page.goto('/')

  const missingTeam = await page.request.get('/api/teams/UNKNOWN00')
  expect(missingTeam.status()).toBe(404)
  expect((await missingTeam.json()).error).toBe('Team not found')

  const missingPlayer = await page.request.post('/api/teams/UNKNOWN00/start', {
    data: { playerId: 'not-a-member', lineCount: 1 },
  })
  expect(missingPlayer.status()).toBe(404)
  expect((await missingPlayer.json()).error).toBe('Team not found')
})

test('reloading during an active game restores the player session', async ({ page }) => {
  await createTeamAs(page, 'Reloading Player')
  await page.getByTestId('line-count-select').selectOption('2')
  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('train-line-1')).toBeVisible()
  await expect(page.getByTestId('train-line-2')).toBeVisible()

  await page.reload()

  await expect(page.getByTestId('train-line-1')).toBeVisible()
  await expect(page.getByTestId('train-line-2')).toBeVisible()
  await expect(page.getByTestId('player-name')).toHaveCount(0)
})

test('malformed stored session falls back to setup instead of crashing', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('delivery-training-session', '{not valid json')
  })
  await page.reload()

  await expect(page.getByTestId('player-name')).toBeVisible()
  await expect(page.getByTestId('create-team')).toBeVisible()
  await expect(page.getByTestId('team-code-value')).toHaveCount(0)
})

test('line selection supports the eight-line boundary when there is one carriage per line', async ({ page }) => {
  const code = await createTeamAs(page, 'Boundary Tester')
  await page.getByTestId('line-count-select').selectOption('8')

  await expect(page.getByTestId('setup-total-parcels')).toContainText('8 parcels')
  await expect(page.getByTestId('carriage-distribution')).toContainText('Line 1: 1 carriage')
  await expect(page.getByTestId('carriage-distribution')).toContainText('Line 8: 1 carriage')

  await page.getByTestId('start-round').click()
  await expect(page.getByTestId('train-line-8')).toBeVisible()
  expect(code).toMatch(/^[A-Z0-9]{8}$/)
})

test('a failed create request leaves the form usable and shows the server error', async ({ page }) => {
  await page.route('**/api/teams', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Storage temporarily unavailable' }),
    })
  })

  await page.goto('/')
  await page.getByTestId('player-name').fill('Offline Host')
  await page.getByTestId('team-name').fill('Unavailable Crew')
  await page.getByTestId('create-team').click()

  await expect(page.getByText('Storage temporarily unavailable')).toBeVisible()
  await expect(page.getByTestId('create-team')).toBeEnabled()
  await expect(page.getByTestId('team-code-value')).toHaveCount(0)
})

// A phone-sized viewport makes every train longer than the screen, so these
// cover the mobile-only horizontal scrolling of each line.
test.describe('mobile horizontal train scrolling', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test('each train line scrolls horizontally and independently', async ({ page }) => {
    await createTeamAs(page, 'Mobile Solo')
    await page.getByTestId('line-count-select').selectOption('2')
    await page.getByTestId('start-round').click()
    await expect(page.getByTestId('train-line-1')).toBeVisible()
    await expect(page.getByTestId('train-line-2')).toBeVisible()
    await waitForTrainsSettled(page)

    const lineOne = page.getByTestId('line-scroll-line-1')
    const lineTwo = page.getByTestId('line-scroll-line-2')

    // Wait until the arrival animation has cleared and each line is scrollable.
    await expect(lineOne).toHaveClass(/is-scrollable/)
    await expect(lineTwo).toHaveClass(/is-scrollable/)

    // Both consists overflow their line container at this width.
    for (const line of [lineOne, lineTwo]) {
      const overflow = await line.evaluate(
        (node) => node.scrollWidth - node.clientWidth,
      )
      expect(overflow).toBeGreaterThan(0)
    }

    // Scrolling one line does not move the other: they scroll independently.
    await lineOne.evaluate((node) => {
      node.scrollLeft = node.scrollWidth
    })
    await expect
      .poll(() => lineOne.evaluate((node) => node.scrollLeft))
      .toBeGreaterThan(0)
    expect(await lineTwo.evaluate((node) => node.scrollLeft)).toBe(0)
  })

  test('dragging a parcel to a line edge scrolls its carriages horizontally', async ({ page }) => {
    await createTeamAs(page, 'Mobile Dragger')
    await page.getByTestId('line-count-select').selectOption('1')
    await page.getByTestId('start-round').click()
    await expect(page.getByTestId('carriage-line-1-carriage-1')).toBeVisible()
    await waitForTrainsSettled(page)

    const lineScroll = page.getByTestId('line-scroll-line-1')
    await expect(lineScroll).toHaveClass(/is-scrollable/)
    const overflow = await lineScroll.evaluate(
      (node) => node.scrollWidth - node.clientWidth,
    )
    expect(overflow).toBeGreaterThan(0)

    const parcel = page.getByTestId('parcel-parcel-1')
    const parcelBox = await parcel.boundingBox()
    const lineBox = await lineScroll.boundingBox()
    const midY = lineBox.y + lineBox.height / 2

    await page.mouse.move(
      parcelBox.x + parcelBox.width / 2,
      parcelBox.y + parcelBox.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      parcelBox.x + parcelBox.width / 2 + 8,
      parcelBox.y + parcelBox.height / 2 + 8,
    )
    await expect(page.getByTestId('drag-overlay')).toBeVisible()

    // Holding near the right edge scrolls the line's carriages into view.
    await page.mouse.move(lineBox.x + lineBox.width - 6, midY, { steps: 6 })
    await expect
      .poll(() => lineScroll.evaluate((node) => node.scrollLeft), { timeout: 3000 })
      .toBeGreaterThan(0)

    const scrolledRight = await lineScroll.evaluate((node) => node.scrollLeft)

    // Holding near the left edge scrolls them back.
    await page.mouse.move(lineBox.x + 6, midY, { steps: 6 })
    await expect
      .poll(() => lineScroll.evaluate((node) => node.scrollLeft), { timeout: 3000 })
      .toBeLessThan(scrolledRight)

    await page.mouse.up()
  })
})


