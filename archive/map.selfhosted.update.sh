#!/bin/bash
GRC_ASN=4242422602
/usr/local/sbin/birdc show route table grc4 all | grep BGP.as_path | sed "s/${GRC_ASN}\x20//g" > /dev/shm/aspath_tmp.txt
/usr/local/sbin/birdc show route table grc6 all | grep BGP.as_path | sed "s/${GRC_ASN}\x20//g" >> /dev/shm/aspath_tmp.txt
sort -n /dev/shm/aspath_tmp.txt | uniq > /dev/shm/aspath.txt
if [ -f /dev/shm/aspath_tmp.txt ]; then
	rm -rf /dev/shm/aspath_tmp.txt
fi
exit 0
