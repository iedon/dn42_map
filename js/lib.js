function crun(cf)
{
	if ( typeof(cf) == "string" ) 
		return (new Function(String(cf)))();
	else if ( typeof(cf) == "function") 
		return cf();
}
