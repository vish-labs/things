# MetaID

## What is this?

MetaID is a domain protocol based on Microvision Chain and MetaID DID protocol. Developers can use MetaID to create their own domain resource.

## What do you mean by `Domain`?

Domain is a concept in MetaID. It is a collection of resources. For example, a domain named `buzz` can be used to create a collection of resources called `buzzes`. Each `buzz` resource has its own unique id, which is a transaction id on Microvision Chain.

## Why do we use such a concept?

We use this concept to make it easier for developers to create their own domain resources. Developers can use MetaID to create their own domain resources, and then use the domain resources to create their own applications.

Previously we used the concept of `Brfc Node` to create metadata, and build Web3 applications on top of it. But this concept is too verbose and not easy to use. So we created another abstraction layer on top of it, which is the concept of `domain`.

We call this abstraction process `DMM` (Domain-Metadata Mapping), similar to the ORM (Object-Relational Mapping) concept in the database field. By doing this, we can create and utilize more semantic and more developer-friendly way to code.

## How to use?

The API examples listed below are still under development. Use with caution.

### Define domain

```ts
import { define, use } from '@metaid/metaid'

// `define` api returns a class represents what the domain is.
const MyFirstDomain = define('my-first-domain', {
  //...
})

// `use` api returns a class represents what the domain is. (using pre-defined domain)
const Buzz = use('buzz')
const GroupMessage = use('group-message')
```

### Connect to wallet

```ts
import { LocalWallet, MetaletWallet, connect } from '@metaid/metaid'

// create a local wallet instance using mnemonic
const localWallet = new LocalWallet('abchereisyourmnenonicstring')
// or use metalet wallet
const metaletWallet = new MetaletWallet()

// connect to wallet and use specific domains
const Buzz = connect(localWallet).use('buzz')
const GroupMessage = connect(metaletWallet).use('group-message')
```

### Use domain

```ts
// list
const buzzes = Buzz.list()

// list filtered by query
const buzzes = Buzz.list({
  where: {
    title: 'Hello World',
  },
})

// my list
const myBuzzes = Buzz.myList()

// has root
const hasRoot: boolean = Buzz.hasRoot()

// create root
if (!hasRoot) {
  await Buzz.createRoot()
}

// get one buzz
const buzz = Buzz.one('0x1234567890') // txid
const buzz = Buzz.first('0x1234567890') // or use alias `first`
const buzz = Buzz.get('0x1234567890') // ...or `get`
const buzz = Buzz.one({
  // use sql-like query
  where: {
    title: 'Hello World',
  },
})

// create
const newBuzz = Buzz.create({
  title: 'Hello World',
  content: 'This is my first buzz',
})

// update
const updatedBuzz = Buzz.update(newBuzz.id, {
  title: 'Hello World Again',
  content: 'Here we go..',
})
// or update one existing resource
const oldBuzz = Buzz.get('0x1234567890')
const updatedBuzz = oldBuzz.update({
  title: 'Hello World',
  content: 'This is my first buzz',
})

// delete TODO
const deletedBuzz = Buzz.delete('0x1234567890')
// or delete one existing resource
oldBuzz.delete()
```
